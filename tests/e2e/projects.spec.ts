import { createTestSession, expect, test } from "./fixtures";

// Each test signs in as its own new user, so the project list starts empty. The users are
// not removed afterwards: a user who owns a project cannot be deleted, and the database is disposable.
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  await context.addCookies([(await createTestSession("Project tester")).cookie]);
});

test("a new user sees no projects, creates one, and finds it in the list", async ({ page }, testInfo) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByText("You have no projects yet.")).toBeVisible();
  await expect(page.getByText("Product data and actions are not connected yet.")).toHaveCount(0);

  await page.getByRole("link", { name: "New project" }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.getByLabel("Project name").fill("  Checkout redesign  ");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects$/);
  const list = page.getByRole("list", { name: "Your projects" });
  await expect(list.getByRole("link", { name: /Checkout redesign/ })).toHaveAttribute("href", /^\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByText("1 project", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("projects-desktop.png"), fullPage: true });
});

test("projects are listed by name and only to their members", async ({ page, browser }) => {
  for (const name of ["Billing", "Accounts"]) {
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(name);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects$/);
  }
  await expect(page.getByRole("list", { name: "Your projects" }).getByRole("link")).toHaveText([/^Accounts/, /^Billing/]);

  const other = await browser.newContext();
  await other.addCookies([(await createTestSession("Other user")).cookie]);
  const otherPage = await other.newPage();
  await otherPage.goto("/projects");
  await expect(otherPage.getByText("You have no projects yet.")).toBeVisible();
  await other.close();
});

test("a blank project name is rejected with a message and nothing is created", async ({ page }, testInfo) => {
  await page.goto("/projects/new");
  const name = page.getByLabel("Project name");
  await name.fill("   ");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Enter a project name." })).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await page.screenshot({ path: testInfo.outputPath("project-form-error.png"), fullPage: true });
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByText("You have no projects yet.")).toBeVisible();
});

test("the create form works with the keyboard and fits a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects/new");
  await page.getByLabel("Project name").focus();
  await page.keyboard.type("Mobile onboarding");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("link", { name: /Mobile onboarding/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("projects-mobile.png"), fullPage: true });
});
