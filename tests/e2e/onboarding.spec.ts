import { createTestSession, expect, test } from "./fixtures";

test("unfinished first-team setup resumes across pages and browser sessions", async ({ browser }, testInfo) => {
  const session = await createTestSession("New user", false);
  let context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 } });
  try {
    await context.addCookies([session.cookie]);
    let page = await context.newPage();
    for (const path of ["/dashboard", "/projects/new", "/teams/new", "/settings", "/not-a-route"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/onboarding$/);
      await expect(page.getByRole("heading", { name: "Name your first team" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    }
    await context.close();
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 } });
    await context.addCookies([session.cookie]);
    page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("Team name").fill("Spec Thread");
    await page.getByLabel("Description").fill("Our first team");
    await page.screenshot({ path: testInfo.outputPath("onboarding-mobile.png"), fullPage: true });
    await page.getByLabel("Team name").fill("   ");
    await page.getByLabel("Description").fill("Our first team");
    await page.getByRole("button", { name: "Create team", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Check the team details");
    await expect(page.getByLabel("Description")).toHaveValue("Our first team");
    await page.getByLabel("Team name").fill("Spec Thread");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Create team", exact: true }).click();
    await expect(page).toHaveURL(/\/teams\/[\da-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Spec Thread", level: 1 })).toBeVisible();
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/teams$/);
    await page.goto("/projects/new");
    await expect(page).toHaveURL(/\/projects\/new$/);
  } finally { await context.close(); session.remove(); }
});

test("team groups expand independently and persist favorites and expansion", async ({ page, context }, testInfo) => {
  const session = await createTestSession("Navigation owner");
  try {
    await context.clearCookies(); await context.addCookies([session.cookie]);
    for (const name of ["A team", "Z team"]) {
      await page.goto("/teams/new");
      await page.getByLabel("Team name").fill(name);
      await page.getByRole("button", { name: "Create team", exact: true }).click();
      await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    }
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const first = nav.getByRole("region", { name: "A team", exact: true });
    const second = nav.getByRole("region", { name: "Z team", exact: true });
    await expect(first.getByRole("link", { name: "Home", exact: true })).toBeVisible();
    await expect(second.getByRole("link", { name: "Home", exact: true })).toBeVisible();
    await second.getByRole("button", { name: "Team actions for Z team", exact: true }).click();
    const menu = second.getByRole("group", { name: "Actions for Z team", exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link")).toHaveText(["Team settings", "Open archive"]);
    await page.screenshot({ path: testInfo.outputPath("team-menu-desktop.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await second.getByRole("button", { name: "Team actions for Z team", exact: true }).press("Enter");
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "Favorite", exact: true }).click();
    await expect(nav.getByRole("region").first()).toHaveAccessibleName("Z team");
    await first.getByRole("button", { name: "Collapse A team", exact: true }).click();
    await expect(first.getByRole("link", { name: "Home", exact: true })).toHaveCount(0);
    await expect(second.getByRole("link", { name: "Home", exact: true })).toBeVisible();
    await page.reload();
    await expect(first.getByRole("button", { name: "Expand A team", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(nav.getByRole("region").first()).toHaveAccessibleName("Z team");
    await first.getByRole("button", { name: "Expand A team", exact: true }).click();
    await expect(first.getByRole("link", { name: "Home", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("teams-navigation-desktop.png"), fullPage: true });
  } finally { session.remove(); }
});
