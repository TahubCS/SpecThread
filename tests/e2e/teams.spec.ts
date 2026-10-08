import { createTestSession, expect, test } from "./fixtures";

test.describe("Teams", () => {
  let session: Awaited<ReturnType<typeof createTestSession>>;
  test.beforeEach(async ({ context }) => {
    session = await createTestSession("Team owner");
    await context.clearCookies();
    await context.addCookies([session.cookie]);
  });
  test.afterEach(() => { session?.remove(); });

  test("create, open, list, and search a real team with sidebar links", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/teams");
    await expect(page.getByRole("heading", { name: "Create your first team" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByText("No teams yet")).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Create team", exact: true }).first().click();
    await page.getByLabel("Team name").fill("  Capstone team  ");
    await page.getByLabel("Description").fill("Build requirements and evidence together.");
    await page.getByRole("button", { name: "Create team", exact: true }).click();
    await expect(page).toHaveURL(/\/teams\/[\da-f-]{36}$/);
    const teamPath = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: "Capstone team", level: 1 })).toBeVisible();
    await expect(page.getByText("Build requirements and evidence together.")).toBeVisible();
    await expect(page.locator("dd")).toHaveText(["Owner", "1"]);
    const tabs = page.getByRole("navigation", { name: "Team sections" });
    await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(tabs.getByRole("link")).toHaveText(["Overview", "Members"]);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Capstone team", exact: true })).toHaveAttribute("href", teamPath);
    await page.screenshot({ path: testInfo.outputPath("team-overview-desktop.png"), fullPage: true });
    await tabs.getByRole("link", { name: "Members", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();
    await expect(page.getByRole("table")).toContainText("Team owner");
    await expect(page.getByRole("table")).toContainText("Owner");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Teams", exact: true }).click();
    const list = page.getByRole("list", { name: "Your teams" });
    await expect(list.getByRole("link", { name: /Capstone team.*Owner.*1 member/ })).toHaveAttribute("href", teamPath);
    await page.screenshot({ path: testInfo.outputPath("teams-desktop.png"), fullPage: true });
    await page.getByLabel("Search teams").fill("capstone");
    await expect(list.getByRole("link")).toHaveCount(1);
    await page.getByLabel("Search teams").fill("different team");
    await expect(page.getByRole("heading", { name: "No matching teams" })).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(list.getByRole("link")).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("teams-mobile.png"), fullPage: true });
    await page.goto(teamPath);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("invalid team names preserve form input and show the API field error", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/teams/new");
    await page.getByLabel("Team name").fill("   ");
    await page.getByLabel("Description").fill("Keep this description");
    await page.getByRole("button", { name: "Create team", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Check the team details and try again.");
    await expect(page.getByLabel("Team name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter a value.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Description")).toHaveValue("Keep this description");
    await page.screenshot({ path: testInfo.outputPath("create-team-mobile.png"), fullPage: true });
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create your first team" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("another account cannot open a team's pages or find its sidebar link", async ({ page, context }) => {
    await page.goto("/teams/new");
    await page.getByLabel("Team name").fill("Private team");
    await page.getByRole("button", { name: "Create team", exact: true }).click();
    await expect(page).toHaveURL(/\/teams\/[\da-f-]{36}$/);
    const teamPath = new URL(page.url()).pathname;
    const outsider = await createTestSession("Outsider");
    try {
      await context.clearCookies();
      await context.addCookies([outsider.cookie]);
      for (const suffix of ["", "/members"]) {
        await page.goto(`${teamPath}${suffix}`);
        await expect(page.getByRole("heading", { name: "Team not found" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Private team" })).toHaveCount(0);
      }
      expect(await (await page.request.get("/api/teams")).json()).toEqual([]);
    } finally { outsider.remove(); }
  });

  test("the sidebar handles a loading request and a retryable failure", async ({ page }) => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    await page.route("**/api/teams", async route => {
      if (++calls === 1) { await waiting; await route.fulfill({ status: 503, json: {} }); }
      else await route.continue();
    });
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("status")).toHaveText("Loading teams…");
    release();
    await expect(nav.getByRole("status")).toContainText("Teams couldn’t be loaded.");
    await nav.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(nav.getByText("No teams yet", { exact: true })).toBeVisible();
  });
});

test.describe("signed-out Teams", () => {
  test.use({ signedIn: false });
  test("both page access and the sidebar endpoint require a session", async ({ page, request }) => {
    expect((await request.get("/api/teams")).status()).toBe(401);
    expect((await request.patch("/api/teams/00000000-0000-0000-0000-000000000000/preferences", { data: { isFavorite: true } })).status()).toBe(401);
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/login\?next=%2Fteams$/);
  });
});
