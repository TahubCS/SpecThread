import type { Page } from "@playwright/test";
import { createTestSession, createTestTeam, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";

// Grouping requirements by milestone or sprint and counting each set (ADR-053). Each test uses its own new user.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Angela Instructor");
  await createTestTeam(owner.userId);
  await context.addCookies([owner.cookie]);
});
test.afterEach(() => clearApiFaults(owner.userId));

async function createProject(page: Page) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Box");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

async function createRequirement(page: Page, projectId: string, title: string, milestone = "") {
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Criterion 1", { exact: true }).fill("Done");
  if (milestone) await page.getByLabel("Milestone or sprint (optional)").fill(milestone);
  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

test("requirements are grouped by milestone, filtered one set at a time, and counted", async ({ page }, testInfo) => {
  const projectId = await createProject(page);
  const opens = await createRequirement(page, projectId, "Box opens", "Sprint 1");
  await createRequirement(page, projectId, "Box closes", "Sprint 1");
  await createRequirement(page, projectId, "Box ships");

  // A label set later on the requirement page, suggested from the labels in use.
  await expect(page.getByLabel("Milestone or sprint")).toHaveValue("");
  await page.getByLabel("Milestone or sprint").fill("Sprint 2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Milestone saved." })).toBeVisible();
  await expect(page.getByText(/^Version 1 ·/)).toBeVisible();

  // "Box opens" has a merged pull request whose checks passed and an acceptance of what is there now.
  const reviewer = await createTestSession("Robert Client");
  await runTestSql(`
    WITH link AS (
      INSERT INTO public.requirement_evidence (requirement_id,kind,repository_id,repository_owner,repository_name,number,state,title,url,
        github_created_at,github_updated_at,linked_by,checks,check_count)
      VALUES ('${opens}','pull_request',1,'acme','box',1,'merged','Open the box','https://github.com/acme/box/pull/1',now(),now(),'${owner.userId}',
        '[{"name":"build","result":"passed","url":null,"completedAt":null,"kind":"check"}]',1)
      RETURNING id)
    INSERT INTO public.requirement_reviews (requirement_id,decision,note,requirement_version,criteria_version,evidence,decided_by)
    SELECT '${opens}','accepted','',1,1,jsonb_build_array(jsonb_build_object('id',id,'kind','pull_request','label','#1','title','Open the box','state','merged')),
      '${reviewer.userId}' FROM link;`);

  await page.goto(`/projects/${projectId}/requirements`);
  await expect(page.getByLabel("Requirement counts")).toHaveText("3 requirements · 1 Evidence complete · 1 Accepted");
  await page.getByLabel("Milestone or sprint").selectOption("Sprint 1");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/milestone=Sprint\+1/);
  const rows = page.getByRole("list", { name: "Requirements" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(page.getByLabel("Requirement counts")).toHaveText("Sprint 1 · 2 requirements · 1 Evidence complete · 1 Accepted");
  await expect(rows.filter({ hasText: "Box opens" })).toContainText("Evidence complete");
  await expect(rows.filter({ hasText: "Box closes" })).not.toContainText("Evidence complete");
  await page.screenshot({ path: testInfo.outputPath("milestone-filter.png"), fullPage: true });

  await page.getByLabel("Milestone or sprint").selectOption("Sprint 2");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByLabel("Requirement counts")).toHaveText("Sprint 2 · 1 requirement · 0 Evidence complete · 0 Accepted");

  await page.goto(`/projects/${projectId}/requirements?milestone=Sprint%209`);
  await expect(page.getByText("No requirements in Sprint 9.")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/requirements?milestone=Sprint%201`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a milestone that cannot be saved is explained and the requirement keeps its label", async ({ page }) => {
  const projectId = await createProject(page);
  const requirementId = await createRequirement(page, projectId, "Box opens", "Sprint 1");
  await failApi(owner.userId, { method: "PUT", path: `^/requirements/${requirementId}/milestone$`, status: 500, body: { status: 500 } });
  await page.getByLabel("Milestone or sprint").fill("Sprint 2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("form", { name: "Milestone" }).getByRole("alert")).toHaveText("The milestone could not be saved. Please try again.");
  await clearApiFaults(owner.userId);
  await page.reload();
  await expect(page.getByLabel("Milestone or sprint")).toHaveValue("Sprint 1");

  // A failed clear keeps the label in the field, as it is still saved.
  await failApi(owner.userId, { method: "PUT", path: `^/requirements/${requirementId}/milestone$`, status: 500, body: { status: 500 } });
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("form", { name: "Milestone" }).getByRole("alert")).toHaveText("The milestone could not be saved. Please try again.");
  await expect(page.getByLabel("Milestone or sprint")).toHaveValue("Sprint 1");
  await clearApiFaults(owner.userId);

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Milestone saved." })).toBeVisible();
  await expect(page.getByLabel("Milestone or sprint")).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("Milestone or sprint")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Clear" })).toHaveCount(0);
});
