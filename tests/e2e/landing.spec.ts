import { expect, test } from "./fixtures";

test.use({ signedIn: false });

const fakeSession = {
  session: { id: "s1", userId: "u1", token: "t1", expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  user: { id: "u1", name: "Ada Lovelace", email: "ada@example.invalid", emailVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
};

test("about and how it works are landing sections reached from the navbar", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/#about$/);
  await expect(page.getByRole("heading", { name: "Requirements connected to the evidence that implements them." })).toBeInViewport();
  await nav.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/#how$/);
  await expect(page.getByRole("heading", { name: /SpecThread shows the work/ })).toBeInViewport();
  await expect(page.locator(".app-sidebar")).toHaveCount(0);
});

test("former about addresses redirect to the landing sections and public policy pages", async ({ page }) => {
  for (const [from, to] of [
    ["/about", /\/#about$/],
    ["/about/how-it-works", /\/#how$/],
    ["/about/privacy", /\/privacy$/],
    ["/about/terms", /\/terms$/],
  ] as const) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to);
    await expect(page.locator(".app-sidebar"), from).toHaveCount(0);
  }
});

test("privacy and terms are public pages without the app sidebar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await expect(page.locator(".app-sidebar")).toHaveCount(0);
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of use", level: 1 })).toBeVisible();
  await expect(page.locator(".app-sidebar")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
});

test("the hero animation plays and can be paused", async ({ page }) => {
  await page.goto("/");
  const productWindow = page.locator("[data-step]");
  const first = Number(await productWindow.getAttribute("data-step"));
  await expect.poll(async () => Number(await productWindow.getAttribute("data-step"))).not.toBe(first);
  await page.getByRole("button", { name: "Pause animation" }).click();
  const held = await productWindow.getAttribute("data-step");
  await page.waitForTimeout(1500);
  await expect(productWindow).toHaveAttribute("data-step", held!);
  await page.getByRole("button", { name: "Play animation" }).click();
  await expect.poll(async () => productWindow.getAttribute("data-step")).not.toBe(held);
});

test("the evidence thread gathers on scroll and can be replayed", async ({ page }) => {
  await page.goto("/");
  const thread = page.locator("[data-gathered]");
  await expect(thread).toHaveAttribute("data-gathered", "false");
  await thread.scrollIntoViewIfNeeded();
  await expect(thread).toHaveAttribute("data-gathered", "true");
  await page.getByRole("button", { name: /Replay/ }).click();
  await expect(thread).toHaveAttribute("data-gathered", "false");
  await expect(thread).toHaveAttribute("data-gathered", "true");
});

test("the review card records the decision when scrolled into view", async ({ page }) => {
  await page.goto("/");
  const decision = page.getByText("Accepted by Maya Ruiz");
  await expect(decision).toBeHidden();
  await page.locator("#review").scrollIntoViewIfNeeded();
  await expect(decision).toBeVisible();
});

test("reduced motion shows every animation in its finished state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("[data-step]")).toHaveAttribute("data-step", "12");
  await expect(page.locator("[data-gathered]")).toHaveAttribute("data-gathered", "true");
  await expect(page.getByText("Accepted by Maya Ruiz")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause animation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Replay/ })).toHaveCount(0);
});

test("signed-in visitors see a dashboard link instead of sign-in links", async ({ page }) => {
  await page.route("**/api/auth/get-session*", route => route.fulfill({ json: fakeSession }));
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
  await expect(nav.getByRole("link", { name: "Log in" })).toHaveCount(0);
});

test("the landing page and policy pages fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/privacy"]) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true);
  }
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByLabel("Open navigation").click();
  await nav.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/#about$/);
  await expect(nav.getByRole("link", { name: "About" })).toBeHidden();
});
