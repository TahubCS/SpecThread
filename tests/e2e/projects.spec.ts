import type { Page } from "@playwright/test";
import { createTestSession, expect, runTestSql, test } from "./fixtures";

// Each test signs in as its own new user, so the project list starts empty. The users are
// not removed afterwards: a user who owns a project cannot be deleted, and the database is disposable.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Project tester");
  await context.addCookies([owner.cookie]);
});

/** Creates a project through the form and returns its ID from the overview address. */
async function createProject(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

test("a new user sees no projects, creates one, and lands on its overview", async ({ page }, testInfo) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByText("You have no projects yet.")).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "New project" }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.getByLabel("Project name").fill("  Checkout redesign  ");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Checkout redesign", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  const details = page.getByRole("complementary", { name: "Project details" });
  await expect(details.getByText("Active")).toBeVisible();
  await expect(details.getByText("Project tester", { exact: true })).toBeVisible();
  await expect(details.getByText("Project tester created the project")).toBeVisible();
  await expect(page.getByText("This project has no requirements yet.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("project-overview-desktop.png"), fullPage: true });

  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("list", { name: "Your projects" }).getByRole("link", { name: /Checkout redesign/ })).toBeVisible();
  await expect(page.getByText("1 project", { exact: true })).toBeVisible();
});

test("projects are listed by name, and other users cannot see or open them", async ({ page, browser }) => {
  const billing = await createProject(page, "Billing");
  await createProject(page, "Accounts");
  await page.goto("/projects");
  await expect(page.getByRole("list", { name: "Your projects" }).getByRole("link")).toHaveText([/^Accounts/, /^Billing/]);

  const other = await browser.newContext();
  await other.addCookies([(await createTestSession("Other user")).cookie]);
  const otherPage = await other.newPage();
  await otherPage.goto("/projects");
  await expect(otherPage.getByText("You have no projects yet.")).toBeVisible();
  for (const path of [`/projects/${billing}`, `/projects/${billing}/requirements`, `/projects/${billing}/settings/repository`, "/projects/not-a-project"]) {
    // The loading state has already started the response, so the status stays 200.
    await otherPage.goto(path);
    await expect(otherPage.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
    await expect(otherPage.getByText("Billing"), path).toHaveCount(0);
  }
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

test("the create form works with the keyboard and the project fits a narrow screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects/new");
  await page.getByLabel("Project name").focus();
  await page.keyboard.type("Mobile onboarding");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Mobile onboarding", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("project-overview-mobile.png"), fullPage: true });
});

test("project tabs show its requirements, planned sections keep the frame, and there is no members page", async ({ page }, testInfo) => {
  const projectId = await createProject(page, "Checkout");
  await runTestSql(`INSERT INTO public.requirements (project_id,title,description,created_by,updated_at) VALUES
      ('${projectId}','Guest checkout','','${owner.userId}',now() - interval '2 days'),
      ('${projectId}','Saved cards','','${owner.userId}',now());`);

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("list", { name: "Recent requirements" }).getByRole("link")).toHaveText([/^Saved cards/, /^Guest checkout/]);
  const details = page.getByRole("complementary", { name: "Project details" });
  await expect(details.getByRole("link", { name: "2" })).toHaveAttribute("href", `/projects/${projectId}/requirements`);
  await expect(details.getByText("Members")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("project-overview-data.png"), fullPage: true });

  const tabs = page.getByRole("navigation", { name: "Project sections" });
  await page.getByRole("link", { name: "View all 2" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/requirements$`));
  await expect(tabs.getByRole("link", { name: "Requirements" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("list", { name: "Requirements" }).getByRole("link")).toHaveCount(2);

  // Membership will be managed on the team, so a project has no members page.
  await expect(tabs.getByRole("link")).toHaveText(["Overview", "Requirements", "Settings"]);
  await page.goto(`/projects/${projectId}/members`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  await page.goto(`/projects/${projectId}/settings/repository`);
  await expect(page.getByRole("heading", { name: "Repository settings", level: 1 })).toBeVisible();
  await expect(page.getByText("Product data and actions are not connected yet.")).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Checkout" })).toBeVisible();
});

test("the owner renames a project, and a blank name is rejected", async ({ page }, testInfo) => {
  const projectId = await createProject(page, "Old name");
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Settings" }).click();
  const name = page.getByLabel("Project name");
  await expect(name).toHaveValue("Old name");

  await name.fill("   ");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter a project name." })).toBeVisible();

  await name.fill("New name");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "New name" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("project-settings.png"), fullPage: true });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: "New name", level: 1 })).toBeVisible();
});

test("the owner archives a project only after confirming", async ({ page }) => {
  const projectId = await createProject(page, "Sunset");
  await page.goto(`/projects/${projectId}/settings`);
  await page.getByRole("button", { name: "Archive project" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Yes, archive this project" })).toHaveCount(0);

  await page.getByRole("button", { name: "Archive project" }).click();
  await page.getByRole("button", { name: "Yes, archive this project" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText("You have no projects yet.")).toBeVisible();

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Archived")).toBeVisible();
  await expect(page.getByText(/This project was archived on/)).toBeVisible();
  await page.goto(`/projects/${projectId}/settings`);
  await expect(page.getByText("This project is archived and can no longer be changed.")).toBeVisible();
  await expect(page.getByLabel("Project name")).toHaveCount(0);
});

test("a member who is not the owner can read the project but not change it", async ({ page, browser }) => {
  const projectId = await createProject(page, "Shared");
  const member = await createTestSession("Grace Hopper");
  await runTestSql(`INSERT INTO public.project_members (project_id,user_id) VALUES ('${projectId}','${member.userId}')`);

  const context = await browser.newContext();
  await context.addCookies([member.cookie]);
  const memberPage = await context.newPage();
  await memberPage.goto(`/projects/${projectId}`);
  await expect(memberPage.getByRole("heading", { name: "Shared", level: 1 })).toBeVisible();
  await memberPage.goto(`/projects/${projectId}/settings`);
  await expect(memberPage.getByText("Only the project owner can rename or archive this project.")).toBeVisible();
  await expect(memberPage.getByLabel("Project name")).toHaveCount(0);
  await expect(memberPage.getByRole("button", { name: "Archive project" })).toHaveCount(0);
  await context.close();
});
