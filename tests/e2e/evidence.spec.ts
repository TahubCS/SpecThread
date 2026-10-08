import type { Page } from "@playwright/test";
import { createTestSession, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";
import {
  clearGitHubFaults, failGitHub, githubId, setGitHubCommits, setGitHubItems, setGitHubUser, sha, type FakeItem,
} from "../support/github";

// Linking GitHub issues and pull requests to a requirement. GitHub is a local stand-in;
// each test connects its own repository, so faults that name it affect no other test.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Evidence tester");
  await context.addCookies([owner.cookie]);
});
test.afterEach(async () => {
  await clearApiFaults(owner.userId);
  await clearGitHubFaults();
});

const issue = (number: number, title: string, extra: Partial<FakeItem> = {}): FakeItem => ({
  number, title, state: "open", user: "ada", created_at: `2026-09-${String(number).padStart(2, "0")}T10:00:00Z`,
  updated_at: "2026-10-01T10:00:00Z", ...extra,
});

/** Creates a project with one requirement and returns the requirement page's address. */
async function createRequirement(page: Page) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Checkout");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = page.url().split("/").at(-1)!;
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill("Guest checkout");
  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
  return { projectId, requirementId: page.url().split("/").at(-1)!, url: page.url() };
}

/** Connects a repository to the project directly in the database, and makes GitHub know its installation. */
async function connect(projectId: string, items: FakeItem[], appInstalled = true) {
  const [installationId, repositoryId] = [githubId(), githubId()];
  await setGitHubUser(`seed-${installationId}`, [{ id: installationId, appInstalled, repositories: [{ id: repositoryId, owner: "acme", name: "web" }] }]);
  await setGitHubItems(repositoryId, items);
  await runTestSql(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
    VALUES ('${projectId}',${installationId},${repositoryId},'acme','web',false,'${owner.userId}')`);
  return { installationId, repositoryId };
}

const rows = (page: Page) => page.locator('ul[aria-label="Linked evidence"] > li');
const reference = (page: Page) => page.getByLabel(/Link an issue, pull request, or commit from/);
async function link(page: Page, text: string) {
  await reference(page).fill(text);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  // The button reads "Linking..." until the attempt has finished and the field has settled.
  await expect(page.getByRole("button", { name: "Link", exact: true })).toBeEnabled();
}

test("without a connected repository the requirement points to project settings", async ({ page }) => {
  const { projectId } = await createRequirement(page);
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.getByText("to link issues, pull requests, and commits.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "project settings" })).toHaveAttribute("href", `/projects/${projectId}/settings/repository`);
  await expect(page.getByRole("button", { name: "Link", exact: true })).toHaveCount(0);
});

test("a member links an issue and pull requests and reads them as a timeline", async ({ page }, testInfo) => {
  const { projectId, url } = await createRequirement(page);
  await connect(projectId, [
    issue(12, "Guests cannot pay"),
    issue(15, "Add guest checkout", { pull: true, user: "grace" }),
    issue(3, "Spike: payment provider", { pull: true, merged: true, state: "closed", closed_at: "2026-09-04T10:00:00Z", user: null }),
  ]);
  await page.goto(url);
  await expect(page.getByText("No issues, pull requests, or commits are linked yet.")).toBeVisible();

  await link(page, "15");
  await expect(rows(page)).toHaveCount(1);
  await expect(reference(page)).toHaveValue("");
  await link(page, "#12");
  await link(page, "https://github.com/acme/web/pull/3/files?diff=split#top");
  await expect(rows(page)).toHaveCount(3);

  // Oldest first by GitHub's own date, regardless of the order they were linked in.
  await expect(rows(page).nth(0)).toContainText("#3");
  await expect(rows(page).nth(0)).toContainText("Merged pull request");
  await expect(rows(page).nth(1)).toContainText("#12");
  await expect(rows(page).nth(1)).toContainText("Open issue");
  await expect(rows(page).nth(1)).toContainText("ada");
  await expect(rows(page).nth(2)).toContainText("Open pull request");
  await expect(rows(page).nth(2)).toContainText("grace");
  await expect(rows(page).nth(1).getByRole("link", { name: /Guests cannot pay/ })).toHaveAttribute("href", "https://github.com/acme/repo/issues/12");
  await expect(page.getByText("From acme/web.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("evidence-timeline.png"), fullPage: true });

  await page.reload();
  await expect(rows(page)).toHaveCount(3);
});

test("a member links commits by SHA or address and sees what changed, alone and inside a pull request", async ({ page }, testInfo) => {
  const { projectId, url } = await createRequirement(page);
  const [first, second, hotfix] = [sha("abc1234"), sha("def5678"), sha("0a1b2c3d")];
  const { repositoryId } = await connect(projectId, [issue(9, "Add guest checkout", {
    pull: true, additions: 40, deletions: 5, changed_files: 3, commits: [
      { sha: first, message: "Add guest path\n\nA longer explanation that is not shown.", date: "2026-09-08T09:00:00Z" },
      { sha: second, message: "Fix totals", date: "2026-09-08T11:00:00Z", login: null, name: "Grace Hopper" },
    ],
  })]);
  await setGitHubCommits(repositoryId, [
    { sha: first, message: "Add guest path\n\nA longer explanation that is not shown.", date: "2026-09-08T09:00:00Z", additions: 12, deletions: 3, files: 2 },
    { sha: hotfix, message: "Hotfix rounding", date: "2026-09-20T09:00:00Z", additions: 1, deletions: 1, files: 1, login: null, name: "Grace Hopper" },
  ]);
  await page.goto(url);

  await link(page, `https://github.com/acme/web/commit/${hotfix}`);
  await link(page, "9");
  await link(page, "ABC1234");
  await expect(rows(page)).toHaveCount(3);

  // Oldest first: the first commit, the pull request opened a day later, then the hotfix.
  const [commit, pull, later] = [rows(page).nth(0), rows(page).nth(1), rows(page).nth(2)];
  await expect(commit).toContainText("abc1234");
  await expect(commit).toContainText("Add guest path");
  await expect(commit).not.toContainText("A longer explanation");
  await expect(commit).toContainText("Commit");
  await expect(commit).toContainText("+12 −3 in 2 files");
  await expect(commit).toContainText("ada");
  await expect(commit.getByRole("link", { name: /Add guest path/ })).toHaveAttribute("href", `https://github.com/acme/repo/commit/${first}`);
  await expect(later).toContainText("0a1b2c3");
  await expect(later).toContainText("+1 −1 in 1 file");
  await expect(later).toContainText("Grace Hopper");

  await expect(pull).toContainText("2 commits, +40 −5 in 3 files");
  const commits = page.getByRole("list", { name: "Commits in #9" }).getByRole("listitem");
  await expect(commits.first()).toBeHidden();
  await pull.getByText("2 commits, +40 −5 in 3 files").click();
  await expect(commits).toHaveCount(2);
  await expect(commits.nth(0)).toContainText("abc1234");
  await expect(commits.nth(1)).toContainText("Fix totals");
  await expect(commits.nth(1)).toContainText("Grace Hopper");
  await page.screenshot({ path: testInfo.outputPath("evidence-commits.png"), fullPage: true });

  for (const [text, message] of [
    [first, "Commit abc1234 is already linked to this requirement."],
    [`https://github.com/acme/web/pull/9/commits/${first}`, "Commit abc1234 is already linked to this requirement."],
    ["deadbeef", "GitHub has no commit deadbeef in acme/web."],
    [`https://github.com/rival/secret/commit/${first}`, "That link is not in acme/web, the repository connected to this project."],
    ["abc123", "Enter an issue or pull request number, a commit SHA, or a GitHub link to one of them."],
  ] as const) {
    await link(page, text);
    await expect(page.getByRole("alert").filter({ hasText: message }), text).toBeVisible();
  }

  // Refreshing reads the pull request again and leaves commits, which never change, as they are.
  await page.getByRole("button", { name: "Refresh from GitHub" }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(0)).toContainText("+12 −3 in 2 files");
  await page.getByRole("button", { name: "Remove link to abc1234" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText("#9");
});

test("references that cannot be linked are refused with the reason and keep what was typed", async ({ page }) => {
  const { projectId, url } = await createRequirement(page);
  await connect(projectId, [issue(7, "Real issue")]);
  await page.goto(url);
  await link(page, "7");
  await expect(rows(page)).toHaveCount(1);

  for (const [text, message] of [
    ["   ", "Enter an issue or pull request number, a commit SHA, or a GitHub link to one of them."],
    ["seven", "Enter an issue or pull request number, a commit SHA, or a GitHub link to one of them."],
    ["0", "Enter an issue or pull request number, a commit SHA, or a GitHub link to one of them."],
    ["https://example.com/acme/web/issues/7", "Enter an issue or pull request number, a commit SHA, or a GitHub link to one of them."],
    ["99", "GitHub has no issue or pull request #99 in acme/web."],
    ["https://github.com/rival/secret/issues/7", "That link is not in acme/web, the repository connected to this project."],
    ["#7", "#7 is already linked to this requirement."],
  ] as const) {
    await link(page, text);
    await expect(page.getByRole("alert").filter({ hasText: message }), text).toBeVisible();
    await expect(reference(page), text).toHaveValue(text);
    await expect(reference(page), text).toHaveAttribute("aria-invalid", "true");
  }
  await expect(rows(page)).toHaveCount(1);
});

test("refreshing reads the current state from GitHub and keeps items GitHub no longer has", async ({ page }) => {
  const { projectId, url } = await createRequirement(page);
  const { repositoryId } = await connect(projectId, [issue(4, "Bug"), issue(9, "Fix the bug", { pull: true }), issue(11, "Will be deleted")]);
  await page.goto(url);
  for (const number of ["4", "9", "11"]) await link(page, number);
  await expect(rows(page)).toHaveCount(3);

  await setGitHubItems(repositoryId, [
    issue(4, "Bug (confirmed)", { state: "closed", closed_at: "2026-10-05T10:00:00Z" }),
    issue(9, "Fix the bug", { pull: true, merged: true, state: "closed", closed_at: "2026-10-05T10:00:00Z" }),
  ]);
  await page.getByRole("button", { name: "Refresh from GitHub" }).click();
  await expect(rows(page).nth(0)).toContainText("Bug (confirmed)");
  await expect(rows(page).nth(0)).toContainText("Closed issue");
  await expect(rows(page).nth(1)).toContainText("Merged pull request");
  await expect(rows(page).nth(2)).toContainText("Will be deleted");
  await expect(rows(page).nth(2)).toContainText("Open issue");
});

test("a link is removed without touching the others", async ({ page }) => {
  const { projectId, url } = await createRequirement(page);
  await connect(projectId, [issue(1, "Keep"), issue(2, "Remove")]);
  await page.goto(url);
  await link(page, "1");
  await link(page, "2");
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Remove link to #2" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).nth(0)).toContainText("Keep");
  await link(page, "2");
  await expect(rows(page)).toHaveCount(2);
});

test("evidence stays readable but cannot change once the requirement or project is archived or the repository is disconnected", async ({ page }) => {
  const { projectId, requirementId, url } = await createRequirement(page);
  await connect(projectId, [issue(5, "Linked before archiving")]);
  await page.goto(url);
  await link(page, "5");
  await expect(rows(page)).toHaveCount(1);
  const readOnly = async () => {
    await page.reload();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).nth(0)).toContainText("Linked before archiving");
    for (const name of ["Link", "Refresh from GitHub", "Remove link to #5"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
  };

  await runTestSql(`UPDATE public.requirements SET archived_at = now() WHERE id = '${requirementId}'`);
  await readOnly();
  await runTestSql(`UPDATE public.requirements SET archived_at = NULL WHERE id = '${requirementId}';
    UPDATE public.projects SET archived_at = now() WHERE id = '${projectId}'`);
  await readOnly();
  await runTestSql(`UPDATE public.projects SET archived_at = NULL WHERE id = '${projectId}';
    DELETE FROM public.project_repositories WHERE project_id = '${projectId}'`);
  await readOnly();
  await expect(page.getByText("No repository is connected, so these links cannot be changed or refreshed.")).toBeVisible();
  await expect(page.getByText("From acme/web.")).toBeVisible();
});

test("the evidence list fits a narrow screen and its controls work with the keyboard", async ({ page }) => {
  const { projectId, url } = await createRequirement(page);
  await connect(projectId, [issue(8, "A very long issue title that has to wrap instead of pushing the page wider than the screen it is shown on")]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "networkidle" });
  await reference(page).focus();
  await page.keyboard.type("8");
  await page.keyboard.press("Enter");
  await expect(rows(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Remove link to #8" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("No issues, pull requests, or commits are linked yet.")).toBeVisible();
});

test("linking and refreshing explain GitHub failures and change nothing", async ({ page }) => {
  const { projectId, url } = await createRequirement(page);
  const { repositoryId, installationId } = await connect(projectId, [issue(6, "First"), issue(7, "Second")]);
  await page.goto(url);
  await link(page, "6");
  await expect(rows(page)).toHaveCount(1);
  const item = `^/repositories/${repositoryId}/`;
  const token = `^/app/installations/${installationId}/access_tokens$`;

  for (const [bearer, fault, message] of [
    ["installation", { path: item, status: 500 }, "GitHub could not be reached. Try again in a moment."],
    ["installation", { path: item, close: true }, "GitHub could not be reached. Try again in a moment."],
    ["installation", { path: item, status: 200, body: { number: "seven" } }, "GitHub could not be reached. Try again in a moment."],
    ["installation", { path: item, status: 401 }, "GitHub could not be reached. Try again in a moment."],
    ["app", { path: token, status: 401 }, "GitHub is not set up for this SpecThread deployment yet."],
    ["app", { path: token, status: 404 }, "The SpecThread app is no longer installed on acme/web. Connect the repository again."],
  ] as const) {
    await failGitHub(bearer, fault);
    await link(page, "7");
    await expect(page.getByRole("alert").filter({ hasText: message }), JSON.stringify(fault)).toBeVisible();
    await expect(reference(page)).toHaveValue("7");
    await page.getByRole("button", { name: "Refresh from GitHub" }).click();
    await expect(page.getByRole("alert").filter({ hasText: message }), `refresh ${JSON.stringify(fault)}`).toHaveCount(2);
    await clearGitHubFaults();
    await page.reload();
    await expect(rows(page)).toHaveCount(1);
  }
  await link(page, "7");
  await expect(rows(page)).toHaveCount(2);
});

test("linking, refreshing, and removing explain API failures and change nothing", async ({ page }) => {
  const { projectId, requirementId, url } = await createRequirement(page);
  await connect(projectId, [issue(6, "First"), issue(7, "Second")]);
  await page.goto(url);
  await link(page, "6");
  await expect(rows(page)).toHaveCount(1);
  const evidence = `^/requirements/${requirementId}/evidence`;

  for (const failure of [{ status: 500 }, { close: true }, { status: 201, body: { id: 1 } }, { status: 404 }] as const) {
    await failApi(owner.userId, { method: "POST", path: `${evidence}$`, ...failure });
    await link(page, "7");
    await expect(page.getByRole("alert").filter({ hasText: "The link could not be added. Please try again." }), JSON.stringify(failure)).toBeVisible();
    await clearApiFaults(owner.userId);
    await page.reload();
  }
  for (const [failure, message] of [
    [{ status: 409, body: { detail: "Archived items cannot be changed." } }, "Archived items cannot be changed."],
    [{ status: 409, body: {} }, "The link could not be added. Please try again."],
    [{ status: 502 }, "GitHub could not be reached. Try again in a moment."],
    [{ status: 503 }, "GitHub is not set up for this SpecThread deployment yet."],
    [{ status: 400, body: { errors: { reference: ["Not that one."] } } }, "Not that one."],
  ] as const) {
    await failApi(owner.userId, { method: "POST", path: `${evidence}$`, ...failure });
    await link(page, "7");
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await clearApiFaults(owner.userId);
  }

  for (const failure of [{ status: 500 }, { close: true }, { status: 200, body: {} }] as const) {
    await failApi(owner.userId, { method: "POST", path: `${evidence}/refresh$`, ...failure });
    await page.getByRole("button", { name: "Refresh from GitHub" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The evidence could not be refreshed. Please try again." })).toBeVisible();
    await clearApiFaults(owner.userId);
    await page.reload();
  }
  for (const failure of [{ status: 500 }, { close: true }] as const) {
    await failApi(owner.userId, { method: "DELETE", path: `${evidence}/`, ...failure });
    await page.getByRole("button", { name: "Remove link to #6" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The link could not be removed. Please try again." })).toBeVisible();
    await clearApiFaults(owner.userId);
    await page.reload();
    await expect(rows(page)).toHaveCount(1);
  }

  // Removed by someone else in the meantime: the list simply updates.
  await runTestSql(`DELETE FROM public.requirement_evidence WHERE requirement_id = '${requirementId}'`);
  await page.getByRole("button", { name: "Remove link to #6" }).click();
  await expect(page.getByText("No issues, pull requests, or commits are linked yet.")).toBeVisible();
});

test("a requirement whose evidence cannot be read shows the error inside the project frame", async ({ page }) => {
  const { projectId, requirementId, url } = await createRequirement(page);
  await connect(projectId, []);
  for (const failure of [{ status: 500 }, { status: 200, body: [{ id: "x" }] }, { close: true }] as const) {
    await failApi(owner.userId, { method: "GET", path: `^/requirements/${requirementId}/evidence$`, ...failure });
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Checkout" })).toBeVisible();
    await clearApiFaults(owner.userId);
  }
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
});
