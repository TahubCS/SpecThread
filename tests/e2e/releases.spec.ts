import type { Page } from "@playwright/test";
import { addTestTeamMember, createTestSession, createTestTeam, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults } from "../support/api-faults";
import { clearGitHubFaults, failGitHub, githubId, setGitHubCommits, setGitHubItems, setGitHubReleases, setGitHubUser, sha } from "../support/github";

// Releases recorded as deployed to an environment (ADR-066, US-13). GitHub is a local stand-in.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Release tester");
  await createTestTeam(owner.userId);
  await context.addCookies([owner.cookie]);
});
test.afterEach(async () => {
  await clearApiFaults(owner.userId);
  await clearGitHubFaults();
});

const [merged, early] = [sha("5ca1ab1e"), sha("0a1b2c3d")];

async function createProject(page: Page) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Checkout");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

async function createRequirement(page: Page, projectId: string, title: string) {
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Criterion 1", { exact: true }).fill("Done");
  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
  return page.url();
}

async function link(page: Page, text: string) {
  await page.getByLabel(/Link an issue, pull request, commit, or release from/).fill(text);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Link", exact: true })).toBeEnabled();
}

async function connect(projectId: string) {
  const [installationId, repositoryId] = [githubId(), githubId()];
  await setGitHubUser(`seed-${installationId}`, [{ id: installationId, repositories: [{ id: repositoryId, owner: "acme", name: "web" }] }]);
  await setGitHubItems(repositoryId, [
    { number: 9, pull: true, merged: true, merge_sha: merged, title: "Add guest checkout", state: "closed", user: "grace",
      created_at: "2026-09-05T10:00:00Z", updated_at: "2026-09-06T10:00:00Z", closed_at: "2026-09-06T10:00:00Z" },
  ]);
  await setGitHubCommits(repositoryId, [{ sha: early, message: "Fix rounding", date: "2026-09-07T10:00:00Z" }]);
  await setGitHubReleases(repositoryId, [
    { tag: "v1.2", name: "Spring release", published_at: "2026-09-25T10:00:00Z", author: "ada", sha: sha("1111111"), contains: [merged] },
  ]);
  await runTestSql(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
    VALUES ('${projectId}',${installationId},${repositoryId},'acme','web',false,'${owner.userId}')`);
  return repositoryId;
}

test("a tech lead records a release to an environment, sees which requirements it includes, and each requirement shows it", async ({ page }, testInfo) => {
  const projectId = await createProject(page);
  const repositoryId = await connect(projectId);
  const checkout = await createRequirement(page, projectId, "Guest checkout");
  await link(page, "9");
  const rounding = await createRequirement(page, projectId, "Rounding");
  await link(page, early);

  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Releases" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/releases$`));
  await expect(page.getByText("No releases have been recorded yet.")).toBeVisible();
  const form = page.getByRole("form", { name: "Record a release" });
  await expect(form.getByLabel("Environment")).toHaveValue("Production");
  await expect(form.getByLabel("Deployed on")).toHaveValue(new Date().toISOString().slice(0, 10));

  // A tag GitHub doesn't have is explained, and what was typed stays.
  await form.getByLabel(/Release tag in acme\/web/).fill("v9.9");
  await form.getByLabel("Environment").fill("Staging");
  await form.getByRole("button", { name: "Record release" }).click();
  await expect(form.getByRole("alert")).toHaveText("GitHub has no published release tagged v9.9 in acme/web.");
  await expect(form.getByLabel(/Release tag in acme\/web/)).toHaveValue("v9.9");
  await expect(form.getByLabel("Environment")).toHaveValue("Staging");
  await failGitHub("installation", { path: `^/repositories/${repositoryId}/compare/`, status: 500, times: 1 });
  await form.getByLabel(/Release tag in acme\/web/).fill("v1.2");
  await form.getByRole("button", { name: "Record release" }).click();
  await expect(form.getByRole("alert")).toHaveText("GitHub could not be reached. Try again in a moment.");

  await form.getByLabel("Environment").fill("Production");
  await form.getByLabel("Deployed on").fill("2026-09-26");
  await form.getByRole("button", { name: "Record release" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/releases/[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name: "v1.2 on Production", level: 1 })).toBeVisible();
  const details = page.locator("dl.release-details");
  await expect(details).toContainText("Spring release");
  await expect(details).toContainText("Sep 26, 2026");
  await expect(details).toContainText("Sep 25, 2026 by ada");
  await expect(details).toContainText(/Recorded byRelease tester on [A-Z][a-z]{2} \d{1,2}, \d{4}, .* UTC/);
  await expect(page.getByRole("heading", { name: "Includes 1 requirement" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Included requirements" }).getByRole("listitem")).toHaveText([/Guest checkout\s*#9/]);
  await page.screenshot({ path: testInfo.outputPath("release-detail.png"), fullPage: true });

  // The requirement it includes shows the deployment; the other one doesn't.
  await page.goto(checkout);
  const deployments = page.getByRole("list", { name: "Deployments" });
  await expect(deployments.getByRole("listitem")).toHaveText(["v1.2 deployed to Production on Sep 26, 2026 · recorded by Release tester"]);
  await page.goto(rounding);
  await expect(page.getByRole("list", { name: "Deployments" })).toHaveCount(0);

  // Recording the same release to the same environment again is refused.
  await page.goto(`/projects/${projectId}/releases`);
  await expect(page.getByRole("list", { name: "Recorded releases" }).getByRole("listitem"))
    .toHaveText([/v1\.2 · Spring release\s*Production\s*Deployed Sep 26, 2026 · Includes 1 requirement · Recorded by Release tester on /]);
  await form.getByLabel(/Release tag in acme\/web/).fill("v1.2");
  await form.getByLabel("Deployed on").fill("2026-09-26");
  await form.getByRole("button", { name: "Record release" }).click();
  await expect(form.getByRole("alert")).toHaveText("v1.2 is already recorded as deployed to Production.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("comparing again includes requirements linked since, and Observers read releases without recording", async ({ page, browser }) => {
  const projectId = await createProject(page);
  await connect(projectId);
  const later = await createRequirement(page, projectId, "Later work");
  await page.goto(`/projects/${projectId}/releases`);
  const form = page.getByRole("form", { name: "Record a release" });
  await form.getByLabel(/Release tag in acme\/web/).fill("v1.2");
  await form.getByLabel("Deployed on").fill("2026-09-26");
  await form.getByRole("button", { name: "Record release" }).click();
  await expect(page.getByRole("heading", { name: "Includes no requirements" })).toBeVisible();
  const releaseUrl = page.url();

  await page.goto(later);
  await link(page, "9");
  await page.goto(releaseUrl);
  await expect(page.getByRole("heading", { name: "Includes no requirements" })).toBeVisible();
  await page.getByRole("button", { name: "Compare again" }).click();
  await expect(page.getByRole("heading", { name: "Includes 1 requirement" })).toBeVisible();
  await expect(page.getByText(/^Compared 1 linked change with GitHub on /)).toBeVisible();

  const observer = await createTestSession("Release observer");
  await addTestTeamMember(projectId, observer.userId, "observer");
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  await context.addCookies([observer.cookie]);
  const reader = await context.newPage();
  await reader.goto(`/projects/${projectId}/releases`);
  await expect(reader.getByRole("list", { name: "Recorded releases" }).getByRole("listitem")).toHaveCount(1);
  await expect(reader.getByText("Your role on this team can read releases but not record them.")).toBeVisible();
  await expect(reader.getByRole("form", { name: "Record a release" })).toHaveCount(0);
  await reader.goto(new URL(releaseUrl).pathname);
  await expect(reader.getByRole("button", { name: "Compare again" })).toHaveCount(0);
  await context.close();
});

test("without a repository the Releases tab says how to connect one", async ({ page }) => {
  const projectId = await createProject(page);
  await page.goto(`/projects/${projectId}/releases`);
  await expect(page.getByText("No releases have been recorded yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "project settings" })).toHaveAttribute("href", `/projects/${projectId}/settings/repository`);
  await expect(page.getByRole("form", { name: "Record a release" })).toHaveCount(0);
});
