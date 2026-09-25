import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { makeSignature } from "better-auth/crypto";

test("an active session skips login and signup", async ({ page }) => {
  const { name } = JSON.parse(await readFile("playwright/.cache/test-web-database.json", "utf8"));
  const secret = process.env.SPECTHREAD_TEST_AUTH_SECRET;
  if (!secret) throw new Error("Test auth secret is missing");
  const userId = randomUUID();
  const sessionId = randomUUID();
  const token = randomUUID();
  const runSql = (sql: string) => execFileSync("docker", [
    "exec", "-u", "postgres", name, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { stdio: "ignore" });

  runSql(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt")
    VALUES ('${userId}','Navigation test','${userId}@example.invalid',true,now(),now());
    INSERT INTO public.session (id,"userId",token,"expiresAt","createdAt","updatedAt")
    VALUES ('${sessionId}','${userId}','${token}',now() + interval '1 hour',now(),now());`);
  try {
    await page.context().addCookies([{
      name: "better-auth.session_token",
      value: `${token}.${await makeSignature(token, secret)}`,
      url: "http://127.0.0.1:3100",
    }]);
    const sessionResponse = await page.request.get("/api/auth/get-session");
    expect((await sessionResponse.json())?.user?.id).toBe(userId);
    for (const route of ["/login", "/signup"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/dashboard$/);
    }
    await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Log in" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Sign up" })).toHaveCount(0);
  } finally {
    runSql(`DELETE FROM public."user" WHERE id = '${userId}'`);
  }
});

test("an invalid session cookie does not skip login", async ({ page }) => {
  await page.context().addCookies([{
    name: "better-auth.session_token", value: "not-a-valid-session",
    url: "http://127.0.0.1:3100",
  }]);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

for (const path of ["/login", "/signup"]) {
  test(`${path} handles returned errors and retries on the current origin`, async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/auth/sign-in/social", async route => {
      expect(new URL(route.request().url()).origin).toBe("http://127.0.0.1:3100");
      expect(route.request().postDataJSON()).toMatchObject({ provider: "github", callbackURL: "/dashboard", errorCallbackURL: "/auth/error" });
      attempts++;
      await route.fulfill({ status: attempts === 1 ? 500 : 429, json: { message: "private-provider-detail" } });
    });
    await page.goto(path);
    const button = page.getByRole("button", { name: /with GitHub/ });
    const alert = page.locator(".auth-panel [role='alert']");
    await button.click();
    await expect(alert).toHaveText("Unable to start GitHub sign-in. Please try again.");
    await expect(button).toBeEnabled();
    await button.click();
    await expect(alert).toContainText("Too many sign-in attempts");
    await expect(button).toBeEnabled();
    expect(attempts).toBe(2);
  });
}

test("network failure makes sign-in retryable", async ({ page }) => {
  await page.route("**/api/auth/sign-in/social", route => route.abort("failed"));
  await page.goto("/login");
  await page.getByRole("button", { name: /with GitHub/ }).click();
  await expect(page.locator(".auth-panel [role='alert']")).toContainText("Please try again.");
  await expect(page.getByRole("button", { name: /with GitHub/ })).toBeEnabled();
});

test("successful initiation follows the provider redirect", async ({ page }) => {
  await page.route("https://github.com/login/oauth/authorize**", route => route.fulfill({ contentType: "text/html", body: "<h1>Test provider</h1>" }));
  await page.route("**/api/auth/sign-in/social", route => route.fulfill({ json: { url: "https://github.com/login/oauth/authorize?client_id=test", redirect: true } }));
  await page.goto("/login");
  await page.getByRole("button", { name: /with GitHub/ }).click();
  await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize/);
});

test("OAuth callback failures use the public error page", async ({ page }) => {
  await page.goto("/api/auth/callback/github?error=access_denied");
  await expect(page).toHaveURL(/\/auth\/error\?error=state_not_found/);
  await expect(page.getByText("This sign-in attempt could not be verified. Start a new attempt to continue.")).toBeVisible();
});

test("error page handles cancellation and untrusted input accessibly", async ({ page }, testInfo) => {
  await page.goto("/auth/error?error=access_denied");
  await expect(page.getByRole("heading", { name: "Sign-in cancelled" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("auth-error-desktop.png"), fullPage: true });
  const retry = page.getByRole("link", { name: "Try signing in again" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/error?error=unknown&error_description=private-provider-detail&callbackURL=https://evil.example");
  await expect(page.getByRole("heading", { name: "Sign-in unsuccessful" })).toBeVisible();
  await expect(page.getByText("private-provider-detail")).toHaveCount(0);
  await expect(page.locator('a[href*="evil.example"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("auth-error-mobile.png"), fullPage: true });
});
