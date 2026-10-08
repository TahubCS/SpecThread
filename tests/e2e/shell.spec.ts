import { expect, test } from "./fixtures";
import { frameFor, initialsOf, isCurrentLink } from "../../app/web/src/lib/app-navigation";

const fakeSession = {
  session: { id: "s1", userId: "u1", token: "t1", expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  user: { id: "u1", name: "Ada Lovelace", email: "ada@example.invalid", emailVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
};

test("frame selection keeps the top header for landing and sign-in only", () => {
  for (const path of ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/error", "/privacy", "/terms", "/onboarding"]) {
    expect(frameFor(path), path).toBe("public");
  }
  for (const path of ["/settings", "/settings/account", "/account", "/help", "/help/example-article",
    "/welcome", "/onboarding/project", "/invites/example-token/expired"]) {
    expect(frameFor(path), path).toBe("settings");
  }
  for (const path of ["/dashboard", "/notifications", "/reviews", "/projects/p/settings/repository",
    "/teams/t/settings", "/not-a-route", "/settingsx", "/helpful", "/login/extra"]) {
    expect(frameFor(path), path).toBe("workspace");
  }
});

test("settings links highlight the current page and only the right descendants", () => {
  expect(isCurrentLink("/settings", "/settings")).toBe(true);
  expect(isCurrentLink("/settings", "/settings/account")).toBe(false);
  expect(isCurrentLink("/settings/data", "/settings/data")).toBe(true);
  expect(isCurrentLink("/help", "/help/example-article")).toBe(true);
  expect(isCurrentLink("/help", "/helpful")).toBe(false);
});

test("profile initials use the name, then the email", () => {
  expect(initialsOf("Hello world23")).toBe("HW");
  expect(initialsOf("  ada   lovelace byron ")).toBe("AL");
  expect(initialsOf("Émile Zola")).toBe("ÉZ");
  expect(initialsOf("", "zoe@example.com")).toBe("Z");
  expect(initialsOf("   ", "")).toBe("?");
});

test("settings pages use the settings sidebar and return to the workspace", async ({ page }) => {
  await page.goto("/help/example-article");
  const settingsNav = page.getByRole("navigation", { name: "Settings navigation" });
  for (const heading of ["Personal", "Security & data", "Getting started"]) {
    await expect(settingsNav.getByText(heading, { exact: true })).toBeVisible();
  }
  await expect(settingsNav.getByRole("link", { name: "Help", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await expect(page.locator(".site-header, .landing-header")).toHaveCount(0);
  await expect(settingsNav.getByRole("link", { name: /About|Privacy|Terms|How it works/ })).toHaveCount(0);
  await settingsNav.getByRole("link", { name: "Welcome" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.route("**/api/auth/get-session*", route => route.fulfill({ json: null }));
  await page.reload();
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to app" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Inbox" })).toBeVisible();
});

test("work pages and unknown routes use the workspace sidebar without a top header", async ({ page }) => {
  for (const route of ["/notifications", "/teams/example-team/settings", "/not-a-specthread-route"]) {
    await page.goto(route);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Inbox" }), route).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings navigation" }), route).toHaveCount(0);
    await expect(page.locator(".site-header, .landing-header"), route).toHaveCount(0);
  }
  for (const route of ["/", "/privacy", "/terms"]) {
    await page.goto(route);
    await expect(page.locator(".site-header, .landing-header"), route).toBeVisible();
    await expect(page.locator(".app-sidebar"), route).toHaveCount(0);
  }
});

test("the settings drawer works on a narrow screen and closes after navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Preferences", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const settingsNav = page.getByRole("navigation", { name: "Settings navigation" });
  await settingsNav.getByRole("link", { name: "Sessions" }).click();
  await expect(page).toHaveURL(/\/settings\/sessions$/);
  await expect(settingsNav).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the profile menu offers settings and sign-in when signed out", async ({ page }) => {
  await page.route("**/api/auth/get-session*", route => route.fulfill({ json: null }));
  await page.goto("/dashboard");
  await expect(page.locator(".app-profile-menu summary")).toHaveAccessibleName("Profile menu, SpecThread");
  await page.getByLabel("Profile menu").click();
  const menu = page.locator(".app-profile-options");
  await expect(menu.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  await expect(menu.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
  await expect(menu.getByRole("button", { name: "Log out" })).toHaveCount(0);
  await expect(page.locator(".app-sidebar-bottom")).toHaveCount(0);
  await menu.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Preferences", level: 1 })).toBeVisible();
});

test("the profile menu shows only Settings while the session loads", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/get-session*", async route => { await held; await route.fulfill({ json: fakeSession }); });
  await page.goto("/dashboard");
  await page.getByLabel("Profile menu").click();
  const menu = page.locator(".app-profile-options");
  await expect(menu.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Log in" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Log out" })).toHaveCount(0);
  release();
  await expect(menu.getByRole("button", { name: "Log out" })).toBeVisible();
});

test("a failed log out keeps the user signed in and explains the error", async ({ page }) => {
  await page.route("**/api/auth/get-session*", route => route.fulfill({ json: fakeSession }));
  await page.route("**/api/auth/sign-out", route => route.fulfill({ status: 500, json: {} }));
  await page.goto("/dashboard");
  const profile = page.getByLabel("Profile menu, Ada Lovelace");
  await expect(profile).toContainText("AL");
  await profile.click();
  const menu = page.locator(".app-profile-options");
  await expect(menu.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/settings/account");
  await menu.getByRole("button", { name: "Log out" }).click();
  await expect(menu.getByRole("alert")).toHaveText("Unable to log out. Please try again.");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(menu.getByRole("button", { name: "Log out" })).toBeEnabled();
});
