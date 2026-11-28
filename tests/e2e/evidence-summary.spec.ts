import type { Page } from "@playwright/test";
import { createTestSession, createTestTeam, expect, runTestSql, test } from "./fixtures";

// The project's evidence status summary (US-18): counts on the overview, each opening the
// matching requirements, and requirements that share a linked pull request flagged.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Angela Instructor");
  await createTestTeam(owner.userId);
  await context.addCookies([owner.cookie]);
});

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

/** Links a pull request directly in the database: merged with a passing check when `merged`. */
async function linkPull(requirementId: string, number: number, merged: boolean) {
  await runTestSql(`INSERT INTO public.requirement_evidence (requirement_id,kind,repository_id,repository_owner,repository_name,number,state,title,url,
    github_created_at,github_updated_at,linked_by,checks,check_count)
    VALUES ('${requirementId}','pull_request',1,'acme','box',${number},'${merged ? "merged" : "open"}','Pull ${number}','https://github.com/acme/box/pull/${number}',
      now(),now(),'${owner.userId}','[{"name":"build","result":"passed","url":null,"completedAt":null,"kind":"check"}]',1)`);
}

test("the overview counts requirements by evidence status, each count opens them, and shared pull requests are flagged", async ({ page }, testInfo) => {
  const projectId = await createProject(page);
  const opens = await createRequirement(page, projectId, "Box opens", "Sprint 1");
  const closes = await createRequirement(page, projectId, "Box closes", "Sprint 1");
  await createRequirement(page, projectId, "Box ships", "Sprint 2");
  await linkPull(opens, 9, true);
  await linkPull(closes, 9, true);
  await linkPull(closes, 10, false);

  await page.goto(`/projects/${projectId}`);
  const summary = page.getByRole("list", { name: "Evidence status" }).getByRole("listitem");
  await expect(summary).toHaveText([
    "0 Evidence complete", "3 missing an issue", "1 missing a merged pull request", "1 missing passing checks", "3 missing a release",
    "2 sharing a pull request with another requirement",
  ]);
  await page.screenshot({ path: testInfo.outputPath("evidence-summary.png"), fullPage: true });

  await summary.filter({ hasText: "missing a merged pull request" }).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/requirements\\?evidence=merged_pull_request$`));
  await expect(page.getByRole("status").filter({ hasText: "Showing requirements missing a merged pull request" })).toBeVisible();
  const rows = page.getByRole("list", { name: "Requirements" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Box ships");

  await page.goto(`/projects/${projectId}`);
  await summary.filter({ hasText: "sharing a pull request" }).getByRole("link").click();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Box opens" })).toContainText("Shares #9");
  await expect(rows.filter({ hasText: "Box closes" })).toContainText("Shares #9");
  await expect(rows.filter({ hasText: "Box closes" })).not.toContainText("#10");

  // The milestone filter keeps the evidence status, and Show all clears only the status.
  await page.getByLabel("Milestone or sprint").selectOption("Sprint 2");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/evidence=shared/);
  await expect(page.getByText("No requirements sharing a pull request with another requirement in Sprint 2.")).toBeVisible();
  await page.getByRole("link", { name: "Show all" }).click();
  await expect(page).toHaveURL(new RegExp(`/requirements\\?milestone=Sprint\\+2$`));
  await expect(rows).toHaveText([/Box ships/]);

  // An address with an unknown status lists everything.
  await page.goto(`/projects/${projectId}/requirements?evidence=verified`);
  await expect(rows).toHaveCount(3);
  await expect(page.getByText(/^Showing requirements/)).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a project without requirements shows no evidence summary", async ({ page }) => {
  const projectId = await createProject(page);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("This project has no requirements yet.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Evidence status" })).toHaveCount(0);
});
