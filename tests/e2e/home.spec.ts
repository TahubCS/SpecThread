import { expect, test } from "@playwright/test";

test("home links to the public dashboard preview", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1505, height: 1045 });
  await page.goto("/");
  await expect(page).toHaveTitle("SpecThread");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /\/icon\.png\?/);
  await expect(page.locator(".site-header .brand img")).toHaveJSProperty("naturalWidth", 112);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Follow the work behind every requirement.");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Product" })).toHaveAttribute("href", "#product");
  await expect(page.locator(".landing-actions").getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("list", { name: "Example evidence path for Invite teammates" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: true });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("link", { name: "Explore the dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Preview · Sample requirements, no project data connected")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
  await expect(page.locator(".app-brand img")).toHaveJSProperty("naturalWidth", 112);
  await expect(page.getByRole("link", { name: "New requirement" })).toHaveAttribute("href", "/projects/example-project/requirements/new");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("landing page stays navigable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".landing-mobile-menu summary").click();
  await expect(page.getByRole("link", { name: "How it works" })).toBeVisible();
  await page.locator(".landing-actions").getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/signup$/);
});

test("dashboard preview switches views and expands an evidence thread", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("list", { name: "Evidence path for ST-104" })).toBeVisible();
  await page.getByRole("button", { name: /ST-098 Connect GitHub repository/ }).click();
  await expect(page.getByRole("list", { name: "Evidence path for ST-098" })).toBeVisible();
  await expect(page.getByText("Pull request evidence missing")).toBeVisible();
  await page.getByRole("tab", { name: "Recent" }).click();
  await expect(page.getByRole("region", { name: /Recently updated/ })).toBeVisible();
  await expect(page.getByRole("region", { name: /Needs review/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByRole("region", { name: /All requirements/ })).toBeVisible();
  await page.getByRole("tab", { name: "Attention" }).click();
  await expect(page.getByRole("region", { name: /Needs review/ })).toBeVisible();
  await page.getByRole("heading", { name: /Missing evidence/ }).getByRole("button").click();
  await expect(page.getByRole("button", { name: /ST-098 Connect GitHub repository/ })).toHaveCount(0);
});

test("app navigation keeps the sidebar while routes change", async ({ page }) => {
  await page.goto("/dashboard");
  const sidebar = page.getByRole("navigation", { name: "Main navigation" });
  await sidebar.getByRole("link", { name: "Projects", exact: true }).first().click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(sidebar.getByRole("link", { name: "Overview" })).toBeVisible();
  await sidebar.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Your work", exact: true })).toBeVisible();
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
