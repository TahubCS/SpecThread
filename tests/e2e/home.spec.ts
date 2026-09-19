import { expect, test } from "@playwright/test";

test("home links to the public dashboard preview", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("SpecThread");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Follow the work behind every requirement.");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: "Preview dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Public preview. No account, projects, or repository data is connected.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create project" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeDisabled();
  expect(errors).toEqual([]);
});

for (const route of ["login", "signup"] as const) {
  test(`${route} provides interactive GitHub sign-in button`, async ({ page }) => {
    await page.goto(`/${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      route === "login" ? "Welcome back" : "Create your account",
    );
    await expect(page.getByRole("button", { name: /with GitHub/ })).toBeEnabled();
    await expect(page.locator("input")).toHaveCount(0);
    await page.getByRole("main").getByRole("link", { name: route === "login" ? "Sign up" : "Log in", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${route === "login" ? "signup" : "login"}$`));
    await page.getByRole("link", { name: "Explore the dashboard preview" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  });
}

test("Better Auth endpoint responds to session queries", async ({ request }) => {
  const response = await request.get("/api/auth/get-session");
  expect(response.status()).toBe(200);
});

test("Better Auth rejects other Vercel and tunnel origins", async ({ request }) => {
  for (const origin of ["https://unrelated.vercel.app", "https://unrelated.ngrok.app"]) {
    const response = await request.post("/api/auth/sign-out", {
      headers: { origin, cookie: "csrf-test=present" },
      data: {},
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe("INVALID_ORIGIN");
  }
  const allowed = await request.post("/api/auth/sign-out", {
    headers: { origin: "http://127.0.0.1:3100", cookie: "csrf-test=present" },
    data: {},
  });
  expect(allowed.status()).toBe(200);
});

test("all skeleton pages fit a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/login", "/signup", "/dashboard"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${route.slice(1) || "home"}-mobile.png`), fullPage: true });
  }
});
