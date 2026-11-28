import type { Page } from "@playwright/test";
import { addTestTeamMember, createTestSession, createTestTeam, expect, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";

// The requirement change record and the project audit trail (ADR-065, US-21).
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Audit tester");
  await createTestTeam(owner.userId);
  await context.addCookies([owner.cookie]);
});
test.afterEach(async () => {
  await clearApiFaults(owner.userId);
});

async function createRequirement(page: Page) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Checkout");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = page.url().split("/").at(-1)!;
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill("Guest checkout");
  await page.getByLabel("Criterion 1", { exact: true }).fill("Pay without an account");
  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
  return { projectId, url: page.url() };
}

const time = /on [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M UTC$/;

test("each change to a requirement shows who made it and when, and the project audit trail lists them newest first", async ({ page }, testInfo) => {
  const { projectId, url } = await createRequirement(page);

  await page.goto(`${url}/edit`);
  await page.getByLabel("Title").fill("Guest checkout, card only");
  await page.getByLabel("Criterion 1", { exact: true }).fill("Pay by card without an account");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Guest checkout, card only", level: 1 })).toBeVisible();
  await page.getByLabel("Milestone or sprint").fill("Sprint 4");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Milestone or sprint")).toHaveValue("Sprint 4");
  await page.getByRole("button", { name: "Archive requirement" }).click();
  await page.getByRole("button", { name: "Yes, archive this requirement" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/requirements$`));
  await page.goto(url);
  await page.getByRole("button", { name: "Restore requirement" }).click();
  await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();

  await page.goto(`${url}/history`);
  const changes = page.getByRole("list", { name: "Requirement changes" }).getByRole("listitem");
  await expect(changes).toHaveText([
    /^Restored the requirement by Audit tester /,
    /^Archived the requirement by Audit tester /,
    /^Set the milestone to “Sprint 4” by Audit tester /,
    /^Edited the title and acceptance criteria \(version 2\) by Audit tester /,
    /^Created the requirement by Audit tester /,
  ]);
  for (const change of await changes.all()) await expect(change).toHaveText(time);
  // Nothing on the page offers to change or remove a record.
  await expect(page.getByRole("region", { name: "Requirement changes" }).getByRole("button")).toHaveCount(0);

  // The overview leads to the project's audit trail.
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("link", { name: "Audit trail" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/audit$`));
  await expect(page.getByRole("heading", { name: "Project audit trail", level: 1 })).toBeVisible();
  const entries = page.getByRole("list", { name: "Audit trail" }).getByRole("listitem");
  await expect(entries).toHaveText([
    /^RequirementGuest checkout, card only: Restored the requirementBy Audit tester · /,
    /^RequirementGuest checkout, card only: Archived the requirement/,
    /^RequirementGuest checkout, card only: Set the milestone to “Sprint 4”/,
    /^RequirementGuest checkout, card only: Edited the title and acceptance criteria \(version 2\)/,
    /^RequirementGuest checkout, card only: Created the requirement/,
  ]);
  await expect(page.getByText("Entries can't be edited or removed.", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("project-audit-trail.png"), fullPage: true });
  await entries.first().getByRole("link", { name: "Guest checkout, card only" }).click();
  await expect(page).toHaveURL(new RegExp(`${url.split("/").at(-1)}/history$`));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/audit`);
  await expect(entries.first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("Observers read the record, and an API without it leaves the other history readable", async ({ page, browser }) => {
  const { projectId, url } = await createRequirement(page);
  const observer = await createTestSession("Audit observer");
  await addTestTeamMember(projectId, observer.userId, "observer");
  const context = await browser.newContext({ baseURL: new URL(url).origin });
  await context.addCookies([observer.cookie]);
  const reader = await context.newPage();
  await reader.goto(`/projects/${projectId}/audit`);
  await expect(reader.getByRole("list", { name: "Audit trail" }).getByRole("listitem")).toHaveText([/Created the requirementBy Audit tester/]);
  await context.close();

  // An API older than the record answers 404; the pages say so and show everything else.
  await failApi(owner.userId, { method: "GET", path: "^/requirements/[^/]+/events$", status: 404 });
  await failApi(owner.userId, { method: "GET", path: "^/projects/[^/]+/audit$", status: 404 });
  await page.goto(`${url}/history`);
  await expect(page.getByText("Requirement changes can't be shown right now. Try again in a few minutes.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acceptance criteria versions" })).toBeVisible();
  await page.goto(`/projects/${projectId}/audit`);
  await expect(page.getByText("The audit trail can't be shown right now. Try again in a few minutes.")).toBeVisible();
});
