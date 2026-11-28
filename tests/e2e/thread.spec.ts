import type { Page } from "@playwright/test";
import { addTestTeamMember, createTestSession, createTestTeam, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";
import { clearGitHubFaults, githubId, setGitHubChecks, setGitHubItems, setGitHubReleases, setGitHubUser, sha, type FakeItem } from "../support/github";

// The evidence thread (US-16, US-20): one chronological page per requirement. GitHub is a local
// stand-in; each test connects its own repository.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Thread tester");
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
  await page.getByLabel("Criterion 1", { exact: true }).fill("A guest can pay without an account");
  await page.getByRole("button", { name: "Add criterion" }).click();
  await page.getByLabel("Criterion 2", { exact: true }).fill("The receipt is emailed");
  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
  return { projectId, url: page.url() };
}

async function connect(projectId: string, items: FakeItem[]) {
  const [installationId, repositoryId] = [githubId(), githubId()];
  await setGitHubUser(`seed-${installationId}`, [{ id: installationId, repositories: [{ id: repositoryId, owner: "acme", name: "web" }] }]);
  await setGitHubItems(repositoryId, items);
  await runTestSql(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
    VALUES ('${projectId}',${installationId},${repositoryId},'acme','web',false,'${owner.userId}')`);
  return repositoryId;
}

async function link(page: Page, text: string) {
  await page.getByLabel(/Link an issue, pull request, commit, or release from/).fill(text);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Link", exact: true })).toBeEnabled();
}

async function record(page: Page, choice: "Accept" | "Request more evidence", note?: string) {
  await page.getByRole("radio", { name: choice, exact: true }).check();
  if (note !== undefined) await page.getByLabel(/^Note/).fill(note);
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByRole("button", { name: "Record decision" })).toBeEnabled();
}

const events = (page: Page) => page.getByRole("list", { name: "Evidence thread" }).getByRole("listitem");

test("a reviewer reads the criteria first, then every event oldest first with who and when, and new evidence follows the decision", async ({ page }, testInfo) => {
  const { projectId, url } = await createRequirement(page);
  const [head, merge] = [sha("abc1234"), sha("5ca1ab1e")];
  const repositoryId = await connect(projectId, [
    { number: 4, title: "Guests cannot pay", state: "closed", user: "ada", created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-06T10:05:00Z",
      closed_at: "2026-09-06T10:05:00Z" },
    { number: 9, pull: true, merged: true, merge_sha: merge, title: "Add guest checkout", state: "closed", user: "grace",
      created_at: "2026-09-05T10:00:00Z", updated_at: "2026-09-06T10:00:00Z", closed_at: "2026-09-06T10:00:00Z",
      commits: [{ sha: head, message: "Add guest path", date: "2026-09-05T09:00:00Z" }] },
  ]);
  await setGitHubChecks(repositoryId, head, {
    runs: [{ name: "build", status: "completed", conclusion: "success", html_url: "https://github.com/acme/web/actions/runs/7", completed_at: "2026-09-05T11:00:00Z" }],
  });
  await setGitHubReleases(repositoryId, [{ tag: "v1.2", name: "Spring release", published_at: "2026-09-10T10:00:00Z", author: "ada", sha: sha("7e1ea5e"), contains: [merge] }]);

  await page.goto(url);
  await link(page, "4");
  await link(page, "9");
  await record(page, "Request more evidence", "Link the release that ships this.");
  await expect(page.getByText("Link the release that ships this.")).toBeVisible();
  await link(page, "v1.2");

  // The requirement page leads to the thread.
  await page.getByRole("link", { name: "Evidence thread" }).click();
  await expect(page).toHaveURL(/\/evidence$/);
  await expect(page.getByRole("heading", { name: "Evidence thread", level: 1 })).toBeVisible();

  // The acceptance criteria come first, before any event.
  const criteria = page.getByRole("list", { name: "Acceptance criteria" });
  await expect(criteria.getByRole("listitem")).toHaveText(["A guest can pay without an account", "The receipt is emailed"]);
  const criteriaBox = await criteria.boundingBox();
  const threadBox = await page.getByRole("list", { name: "Evidence thread" }).boundingBox();
  expect(criteriaBox!.y).toBeLessThan(threadBox!.y);

  // GitHub's history comes before anything was linked; SpecThread's events are in the order they happened.
  await expect(events(page)).toHaveText([
    /^Issue #4 “Guests cannot pay” opened.*By ada on GitHub · Sep 1, 2026, 10:00 AM UTC$/,
    /^Pull request #9 “Add guest checkout” opened.*By grace on GitHub · Sep 5, 2026, 10:00 AM UTC$/,
    /^Check passed: build on #9.*Reported by GitHub · Sep 5, 2026, 11:00 AM UTC$/,
    /^Pull request #9 merged.*Reported by GitHub · Sep 6, 2026/,
    /^Issue #4 closed.*Reported by GitHub · Sep 6, 2026/,
    /^Release v1\.2 “Spring release” published.*By ada on GitHub · Sep 10, 2026, 10:00 AM UTC\s*Includes #9$/,
    /^Requirement created\s*By Thread tester · /,
    /^Acceptance criteria version 1 saved \(2 criteria\)\s*By Thread tester · /,
    /^Linked #4 “Guests cannot pay”\s*By Thread tester · /,
    /^Linked #9 “Add guest checkout”\s*By Thread tester · /,
    /^More evidence requested \(acceptance criteria version 1\)\s*By Thread tester · .*UTC\s*Link the release that ships this\.$/,
    // Evidence added after the decision appears after it (US-20).
    /^Linked v1\.2 “Spring release”\s*By Thread tester · /,
  ]);
  await expect(events(page).nth(2).getByRole("link")).toHaveAttribute("href", "https://github.com/acme/web/actions/runs/7");
  await expect(page.getByRole("main")).not.toContainText(/verified|proven/i);
  await page.screenshot({ path: testInfo.outputPath("evidence-thread.png"), fullPage: true });

  // At phone width the thread still fits without scrolling sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(events(page).last()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("evidence-thread-phone.png"), fullPage: true });
});

test("a thread without a repository starts with the requirement, says what is still running, and survives an unreadable history", async ({ page }) => {
  const { projectId, url } = await createRequirement(page);
  await page.goto(`${url}/evidence`);
  await expect(events(page)).toHaveText([/^Requirement created/, /^Acceptance criteria version 1 saved \(2 criteria\)/]);
  await expect(page.getByText(/still running/)).toHaveCount(0);

  const head = sha("abc1234");
  const repositoryId = await connect(projectId, [
    { number: 9, pull: true, title: "Add guest checkout", state: "open", user: "grace", created_at: "2026-09-05T10:00:00Z", updated_at: "2026-09-05T10:00:00Z",
      commits: [{ sha: head, message: "Add guest path", date: "2026-09-05T09:00:00Z" }] },
  ]);
  await setGitHubChecks(repositoryId, head, { runs: [{ name: "e2e", status: "in_progress", conclusion: null }] });
  await page.goto(url);
  await link(page, "9");
  await page.goto(`${url}/evidence`);
  await expect(page.getByText("1 check is still running and will appear once it reports.")).toBeVisible();
  await expect(events(page).filter({ hasText: "e2e" })).toHaveCount(0);

  // An API that can't list link changes (the previous API answers 404) leaves the rest of the thread readable.
  await failApi(owner.userId, { method: "GET", path: "^/requirements/[^/]+/evidence/history$", status: 404 });
  await page.reload();
  await expect(page.getByText("Changes to the evidence links can't be shown right now. Try again in a few minutes.")).toBeVisible();
  await expect(events(page).first()).toHaveText(/^Pull request #9 “Add guest checkout” opened/);
});

test("Observers read the thread, and a requirement in another project is not found", async ({ page, browser }) => {
  const { projectId, url } = await createRequirement(page);
  const observer = await createTestSession("Thread observer");
  await addTestTeamMember(projectId, observer.userId, "observer");
  const context = await browser.newContext({ baseURL: new URL(url).origin });
  await context.addCookies([observer.cookie]);
  const reader = await context.newPage();
  await reader.goto(`${new URL(url).pathname}/evidence`);
  await expect(events(reader).first()).toHaveText(/^Requirement created\s*By Thread tester/);
  await context.close();

  const other = await createRequirement(page);
  await page.goto(`/projects/${other.projectId}/requirements/${url.split("/").at(-1)}/evidence`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
