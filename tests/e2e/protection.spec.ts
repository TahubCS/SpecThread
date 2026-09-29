import { createTestSession, expect, test } from "./fixtures";
import { isPublicPath, safeNextPath } from "../../app/web/src/lib/app-navigation";

test("only the eight public pages are public", () => {
  for (const path of ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/error", "/privacy", "/terms"]) {
    expect(isPublicPath(path), path).toBe(true);
  }
  for (const path of ["/dashboard", "/settings", "/help", "/invites/x", "/login/extra", "/privacyx", "/not-a-route"]) {
    expect(isPublicPath(path), path).toBe(false);
  }
});

test("safeNextPath keeps same-site paths and rejects everything else", () => {
  expect(safeNextPath("/teams")).toBe("/teams");
  expect(safeNextPath("/teams?tab=members#top")).toBe("/teams?tab=members#top");
  expect(safeNextPath("/projects/p/requirements/r/review")).toBe("/projects/p/requirements/r/review");
  expect(safeNextPath("/teams?q=a%2Fb")).toBe("/teams?q=a%2Fb");
  for (const bad of [
    "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)",
    "", "teams", "/tea\u0000ms", "/tea\nms", `/${"a".repeat(2048)}`,
    "/login", "/login?next=/teams", "/signup", "/signup?x=1",
    // Stricter inputs that Better Auth's own callbackURL check rejects with 403.
    "/teams?q=a\\b", "/a%2Fb", "/a%2fb", "/a%5Cb", "/a%5cb", "/tea\u0085ms",
  ]) {
    expect(safeNextPath(bad), JSON.stringify(bad).slice(0, 40)).toBe("/dashboard");
  }
  for (const bad of [undefined, null, 42, ["/teams"], { path: "/teams" }]) {
    expect(safeNextPath(bad)).toBe("/dashboard");
  }
});

test.describe("signed out", () => {
  test.use({ signedIn: false });

  test("protected pages redirect to login and keep the requested page", async ({ page }) => {
    for (const path of ["/dashboard", "/settings", "/settings/account", "/help", "/welcome",
      "/invites/example-token", "/projects/example-project/requirements", "/not-a-route", "/teams?tab=members"]) {
      await page.goto(path);
      const url = new URL(page.url());
      expect(url.pathname, path).toBe("/login");
      expect(url.searchParams.get("next"), path).toBe(path);
      await expect(page.getByRole("heading", { name: "Log in to SpecThread" }), path).toBeVisible();
      await expect(page.locator(".app-sidebar"), path).toHaveCount(0);
    }
  });

  test("a forged session cookie does not pass the gate", async ({ page }) => {
    await page.context().addCookies([{ name: "better-auth.session_token", value: "forged.value", url: "http://127.0.0.1:3100" }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("look-alike asset paths do not bypass the gate", async ({ page }) => {
    for (const path of ["/icon.png/x", "/thread-mark.pngfoo", "/favicon.ico.html"]) {
      await page.goto(path);
      expect(new URL(page.url()).pathname, path).toBe("/login");
    }
  });

  test("public pages and their assets load without a session", async ({ page }) => {
    for (const path of ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/error", "/privacy", "/terms"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname, path).toBe(path);
    }
    for (const asset of ["/thread-mark.png", "/icon.png"]) {
      const response = await page.request.get(asset);
      expect(response.status(), asset).toBe(200);
      expect(response.headers()["content-type"], asset).toContain("image/png");
    }
  });

  test("signing in returns to the requested page", async ({ page, sessionCookie }) => {
    await page.route("**/api/auth/sign-in/email", async route => {
      await page.context().addCookies([sessionCookie]);
      await route.fulfill({ json: { redirect: false, token: "test-token", user: {
        id: "u1", name: "Test user", email: "person@example.invalid", emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      } } });
    });
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/login\?next=%2Fteams$/);
    await page.getByLabel("Email", { exact: true }).fill("person@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("a long enough password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/teams$/);
    await expect(page.getByRole("heading", { name: "Teams", level: 1 })).toBeVisible();
  });

  test("sign-in pages keep the requested page and ignore unsafe ones", async ({ page }) => {
    let socialBody: unknown;
    await page.route("**/api/auth/sign-in/social", async route => {
      socialBody = route.request().postDataJSON();
      await route.fulfill({ status: 500, json: {} });
    });
    await page.goto("/login?next=%2Fteams");
    await page.getByRole("button", { name: "Continue with GitHub" }).click();
    await expect.poll(() => socialBody).toMatchObject({ callbackURL: "/teams" });
    await expect(page.getByRole("main").getByRole("link", { name: "Sign up", exact: true })).toHaveAttribute("href", "/signup?next=%2Fteams");
    await expect(page.getByRole("link", { name: "Explore the dashboard preview" })).toHaveCount(0);
    await page.goto("/login?next=%2F%2Fevil.example");
    await expect(page.getByRole("main").getByRole("link", { name: "Sign up", exact: true })).toHaveAttribute("href", "/signup");
  });
});

test("signed-in visitors to login and signup go straight to the requested page", async ({ page }) => {
  await page.goto("/login?next=%2Fteams");
  await expect(page).toHaveURL(/\/teams$/);
  await page.goto("/signup?next=%2F%2Fevil.example");
  await expect(page).toHaveURL(/127\.0\.0\.1:3100\/dashboard$/);
});

test("a session revoked while browsing is sent to login on the next page", async ({ browser }) => {
  const seeded = await createTestSession("Revoked session");
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  const page = await context.newPage();
  try {
    await context.addCookies([seeded.cookie]);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
    seeded.remove();
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/login\?next=%2Fteams$/);
  } finally {
    await context.close();
    seeded.remove();
  }
});

test("the gate forwards Better Auth's refreshed session cookie", async ({ playwright }) => {
  // createTestSession expires in one day, so it is already inside Better Auth's refresh window.
  const seeded = await createTestSession("Refresh due");
  const request = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
    extraHTTPHeaders: { cookie: `${seeded.cookie.name}=${seeded.cookie.value}` },
  });
  try {
    const response = await request.get("/dashboard", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["set-cookie"] ?? "").toContain("better-auth.session_token=");
  } finally {
    await request.dispose();
    seeded.remove();
  }
});
