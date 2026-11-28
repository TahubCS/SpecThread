import type { Page } from "@playwright/test";
import { addTestTeamMember, createTestSession, createTestTeam, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults } from "../support/api-faults";
import { clearGitHubFaults, githubId, listGitHubRuns, setGitHubUser, setGitHubWorkflows, updateLatestGitHubRun } from "../support/github";

// The predefined Playwright verification through GitHub Actions (ADR-070, US-15). GitHub is a local stand-in.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Verification lead");
  await createTestTeam(owner.userId);
  await context.addCookies([owner.cookie]);
});
test.afterEach(async () => {
  await clearApiFaults(owner.userId);
  await clearGitHubFaults();
});

async function createRequirement(page: Page) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Checkout");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = page.url().split("/").at(-1)!;
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill("Guest checkout");
  await page.getByLabel("Criterion 1", { exact: true }).fill("Done");
  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
  return { projectId, url: page.url() };
}

async function connect(projectId: string) {
  const [installationId, repositoryId] = [githubId(), githubId()];
  await setGitHubUser(`seed-${installationId}`, [{ id: installationId, repositories: [{ id: repositoryId, owner: "acme", name: "web" }] }]);
  await setGitHubWorkflows(repositoryId, [{ file: "specthread-verification.yml", name: "SpecThread verification" }]);
  await runTestSql(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
    VALUES ('${projectId}',${installationId},${repositoryId},'acme','web',false,'${owner.userId}')`);
  return repositoryId;
}

test("an Owner sets up the workflow, a member runs it for a requirement, and its result, times, and log are kept there", async ({ page, browser }, testInfo) => {
  const { projectId, url } = await createRequirement(page);
  const repositoryId = await connect(projectId);

  // Not set up yet: the requirement shows no Verification section, and settings say so.
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Verification" })).toHaveCount(0);
  await page.goto(`/projects/${projectId}/settings`);
  await expect(page.getByRole("link", { name: /Verification\s*Not set up/ })).toBeVisible();
  await page.getByRole("link", { name: /Verification\s*Not set up/ }).click();
  await expect(page.getByRole("heading", { name: "Verification", level: 1 })).toBeVisible();
  const form = page.getByRole("form", { name: "Verification workflow" });
  await expect(form.getByLabel(/Workflow file in acme\/web/)).toHaveValue("specthread-verification.yml");
  await expect(form.getByLabel("Branch it runs on")).toHaveValue("main");

  // A workflow GitHub doesn't have is explained and what was typed stays.
  await form.getByLabel(/Workflow file in acme\/web/).fill("missing.yml");
  await form.getByRole("button", { name: "Save verification" }).click();
  await expect(form.getByRole("alert")).toHaveText("GitHub has no workflow missing.yml in acme/web, or the SpecThread app can't read its Actions.");
  await expect(form.getByLabel(/Workflow file in acme\/web/)).toHaveValue("missing.yml");
  await form.getByLabel(/Workflow file in acme\/web/).fill("specthread-verification.yml");
  await form.getByRole("button", { name: "Save verification" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Verification saved." })).toBeVisible();
  await page.getByText("A workflow to start from").click();
  await expect(page.locator("pre")).toContainText("run-name: SpecThread verification ${{ inputs.specthread_run }}");
  await page.screenshot({ path: testInfo.outputPath("verification-settings.png"), fullPage: true });

  // A member starts it from the requirement; only the predefined workflow runs.
  await page.goto(url);
  const section = page.getByRole("region", { name: "Verification" });
  await expect(section).toContainText("The predefined verification (specthread-verification.yml) hasn't been run for this requirement.");
  await section.getByRole("button", { name: "Run verification" }).click();
  const runs = section.getByRole("list", { name: "Verification runs" }).getByRole("listitem");
  await expect(runs).toHaveCount(1);
  await expect(runs.first()).toContainText("Requested");
  await expect(runs.first()).toContainText(/Started by Verification lead on [A-Z][a-z]{2} \d{1,2}, \d{4}, .* UTC/);
  await expect(section.getByRole("button", { name: "Run verification" })).toBeDisabled();
  const dispatched = await listGitHubRuns(repositoryId);
  expect(dispatched).toHaveLength(1);
  expect(Object.keys(dispatched[0].inputs)).toEqual(["specthread_run"]);

  // GitHub finishes it with a failure; refreshing records the result, the time, and the log link.
  await updateLatestGitHubRun(repositoryId, { status: "completed", conclusion: "failure", updated_at: "2026-11-28T10:05:00Z" });
  await section.getByRole("button", { name: "Refresh from GitHub" }).click();
  await expect(runs.first()).toContainText("Check failed");
  await expect(runs.first()).toContainText("finished Nov 28, 2026, 10:05 AM UTC");
  await expect(runs.first().getByRole("link", { name: /Run log/ })).toHaveAttribute("href", "https://github.com/acme/repo/actions/runs/1");
  await expect(section).not.toContainText(/verified|proven/i);
  await page.screenshot({ path: testInfo.outputPath("verification-runs.png"), fullPage: true });

  // An Observer reads the runs but can't start one.
  const observer = await createTestSession("Verification observer");
  await addTestTeamMember(projectId, observer.userId, "observer");
  const context = await browser.newContext({ baseURL: new URL(url).origin });
  await context.addCookies([observer.cookie]);
  const reader = await context.newPage();
  await reader.goto(new URL(url).pathname);
  await expect(reader.getByRole("region", { name: "Verification" }).getByRole("listitem")).toContainText(["Check failed"]);
  await expect(reader.getByRole("button", { name: "Run verification" })).toHaveCount(0);
  await reader.goto(`/projects/${projectId}/settings/verification`);
  await expect(reader.getByText("Only the team Owner or an Admin can set up the verification.")).toBeVisible();
  await context.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a run GitHub won't start is shown as not started with the reason, and another can be started", async ({ page }) => {
  const { projectId, url } = await createRequirement(page);
  const repositoryId = await connect(projectId);
  await page.goto(`/projects/${projectId}/settings/verification`);
  const form = page.getByRole("form", { name: "Verification workflow" });
  await form.getByLabel("Branch it runs on").fill("release");
  await form.getByRole("button", { name: "Save verification" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Verification saved." })).toBeVisible();

  await page.goto(url);
  const section = page.getByRole("region", { name: "Verification" });
  await section.getByRole("button", { name: "Run verification" }).click();
  await expect(section.getByRole("alert")).toContainText("GitHub didn't start specthread-verification.yml on release.");
  await expect(section.getByRole("list", { name: "Verification runs" }).getByRole("listitem").first()).toContainText("Not started");
  await expect(section.getByRole("button", { name: "Run verification" })).toBeEnabled();
  expect(await listGitHubRuns(repositoryId)).toHaveLength(0);
});
