import type { Page } from "@playwright/test";
import { createTestSession, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";
import { clearGitHubFaults, failGitHub, githubId, linkGitHubAccount, setGitHubUser, type FakeInstallation } from "../support/github";

// Connecting a GitHub repository to a project. GitHub is a local stand-in
// (scripts/test-github.mjs); each test describes what its own user's GitHub token can see.
let owner: Awaited<ReturnType<typeof createTestSession>>;
let token: string;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Repository tester");
  await context.addCookies([owner.cookie]);
});
test.afterEach(async () => {
  await clearApiFaults(owner.userId);
  await clearGitHubFaults("app");
  if (token) await clearGitHubFaults(token);
});

async function createProject(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

/** Links GitHub to the owner and makes GitHub show one installation with the given repositories. */
async function gitHubWith(repositories: FakeInstallation["repositories"], extra: Partial<FakeInstallation> = {}) {
  token = await linkGitHubAccount(owner.userId);
  const installation = { id: githubId(), repositories, ...extra };
  await setGitHubUser(token, [installation]);
  return installation;
}

const repo = (name: string, isPrivate = false) => ({ id: githubId(), owner: "acme", name, private: isPrivate });

test("the owner connects a repository GitHub shows them, sees it across the project, and disconnects it", async ({ page }, testInfo) => {
  const projectId = await createProject(page, "Checkout");
  await gitHubWith([repo("web-shop", true), repo("api")]);

  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("link", { name: /GitHub repository Not connected/ })).toBeVisible();
  await page.getByRole("link", { name: /GitHub repository/ }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings/repository$`));
  await expect(page.getByRole("link", { name: /install the SpecThread app on GitHub/ }))
    .toHaveAttribute("href", "https://github.com/apps/specthread-test/installations/new");
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByRole("listitem").filter({ hasText: "acme/web-shop" })).toContainText("Private");
  await page.screenshot({ path: testInfo.outputPath("repository-picker.png"), fullPage: true });

  await page.getByRole("button", { name: "Connect repository" }).click();
  await expect(page.getByRole("link", { name: /acme\/web-shop/ })).toHaveCount(0);
  await page.getByRole("radio", { name: /acme\/web-shop/ }).check();
  await page.getByRole("button", { name: "Connect repository" }).click();

  const connected = page.getByRole("link", { name: /acme\/web-shop/ });
  await expect(connected).toHaveAttribute("href", "https://github.com/acme/web-shop");
  await expect(page.getByText("Connected by Repository tester on")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("repository-connected.png"), fullPage: true });

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("complementary", { name: "Project details" }).getByRole("link", { name: "acme/web-shop" })).toBeVisible();
  await page.goto(`/projects/${projectId}/settings`);
  await expect(page.getByRole("link", { name: /GitHub repository acme\/web-shop/ })).toBeVisible();

  await page.goto(`/projects/${projectId}/settings/repository`);
  await page.getByRole("button", { name: "Disconnect repository" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Yes, disconnect" })).toHaveCount(0);
  await page.getByRole("button", { name: "Disconnect repository" }).click();
  await page.getByRole("button", { name: "Yes, disconnect" }).click();
  await expect(page.getByRole("radio")).toHaveCount(2);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("complementary", { name: "Project details" }).getByRole("link", { name: "Not connected" })).toBeVisible();
});

test("an owner without a linked GitHub account is sent to link it first", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  await page.goto(`/projects/${projectId}/settings/repository`);
  await expect(page.getByText("Connecting a repository uses your GitHub account.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "your account page" })).toHaveAttribute("href", "/settings/account");
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("an owner whose GitHub sign-in is no longer accepted is told to sign in again", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  token = await linkGitHubAccount(owner.userId); // GitHub has never heard of this token, so it answers 401.
  await page.goto(`/projects/${projectId}/settings/repository`);
  await expect(page.getByText("GitHub did not accept your GitHub sign-in.")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("with no installation the owner is told to install the app, and the list fits a narrow screen", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  token = await linkGitHubAccount(owner.userId);
  await setGitHubUser(token, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${projectId}/settings/repository`);
  await expect(page.getByText("The SpecThread app is not installed on any repository you can access.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect repository" })).toHaveCount(0);

  await setGitHubUser(token, [{ id: githubId(), repositories: [repo("a-repository-with-a-very-long-name-that-must-not-overflow-the-screen")] }]);
  await page.getByRole("link", { name: "reload this list" }).click();
  await expect(page.getByRole("radio")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("members who are not the owner, and archived projects, see the connection but cannot change it", async ({ page, browser }) => {
  const projectId = await createProject(page, "Shared");
  await gitHubWith([repo("web-shop")]);
  await page.goto(`/projects/${projectId}/settings/repository`);
  await page.getByRole("radio", { name: /acme\/web-shop/ }).check();
  await page.getByRole("button", { name: "Connect repository" }).click();
  await expect(page.getByRole("link", { name: /acme\/web-shop/ })).toBeVisible();

  const member = await createTestSession("Grace Hopper");
  await runTestSql(`INSERT INTO public.project_members (project_id,user_id) VALUES ('${projectId}','${member.userId}')`);
  const context = await browser.newContext();
  await context.addCookies([member.cookie]);
  const memberPage = await context.newPage();
  await memberPage.goto(`/projects/${projectId}/settings/repository`);
  await expect(memberPage.getByRole("link", { name: /acme\/web-shop/ })).toBeVisible();
  await expect(memberPage.getByRole("button", { name: "Disconnect repository" })).toHaveCount(0);
  await context.close();

  await runTestSql(`UPDATE public.projects SET archived_at = now() WHERE id = '${projectId}'`);
  await page.reload();
  await expect(page.getByRole("link", { name: /acme\/web-shop/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect repository" })).toHaveCount(0);

  const otherProject = await createProject(page, "Other");
  await runTestSql(`INSERT INTO public.project_members (project_id,user_id) VALUES ('${otherProject}','${member.userId}')`);
  const second = await browser.newContext();
  await second.addCookies([member.cookie]);
  const secondPage = await second.newPage();
  await secondPage.goto(`/projects/${otherProject}/settings/repository`);
  await expect(secondPage.getByText("No repository is connected. Only the project owner can connect one.")).toBeVisible();
  await second.close();
});

test("a repository the user can no longer reach is refused when connecting", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  const installation = await gitHubWith([repo("web-shop")]);
  await page.goto(`/projects/${projectId}/settings/repository`);
  await page.getByRole("radio", { name: /acme\/web-shop/ }).check();

  await setGitHubUser(token, [{ ...installation, repositories: [] }]);
  await page.getByRole("button", { name: "Connect repository" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "GitHub does not show this repository to you through that installation." })).toBeVisible();

  await setGitHubUser(token, [{ ...installation, appInstalled: false }]);
  await page.getByRole("button", { name: "Connect repository" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The SpecThread app is no longer installed there." })).toBeVisible();

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("complementary", { name: "Project details" }).getByRole("link", { name: "Not connected" })).toBeVisible();
});

for (const [label, fault, message] of [
  ["GitHub is down", { path: "^/user/installations$", status: 500 }, "GitHub could not be reached."],
  ["GitHub drops the connection", { path: "^/user/installations$", close: true }, "GitHub could not be reached."],
  ["GitHub is rate limiting", { path: "^/user/installations$", status: 429 }, "GitHub could not be reached."],
  ["GitHub answers with something unexpected", { path: "^/user/installations$", status: 200, body: { installations: "none" } }, "GitHub could not be reached."],
  ["GitHub rejects the token", { path: "^/user/installations$", status: 401 }, "GitHub did not accept your GitHub sign-in."],
] as const) {
  test(`the repository list explains itself and recovers when ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Checkout");
    await gitHubWith([repo("web-shop")]);
    await failGitHub(token, fault);
    await page.goto(`/projects/${projectId}/settings/repository`);
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);

    await clearGitHubFaults(token);
    await page.reload();
    await expect(page.getByRole("radio", { name: /acme\/web-shop/ })).toBeVisible();
  });
}

for (const [label, bearer, fault, message] of [
  ["GitHub fails while checking the repository", "user", { path: "/repositories$", status: 502 }, "GitHub could not be reached. Try again in a moment."],
  ["GitHub drops the connection while checking the app", "app", { path: "/access_tokens$", close: true }, "GitHub could not be reached. Try again in a moment."],
  ["GitHub rejects the app's credentials", "app", { path: "/access_tokens$", status: 401 }, "GitHub is not set up for this SpecThread deployment yet."],
  ["GitHub rejects the user's token", "user", { path: "/repositories$", status: 401 }, "GitHub did not accept your GitHub sign-in. Link GitHub again and retry."],
] as const) {
  test(`connecting saves nothing and explains the failure when ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Checkout");
    await gitHubWith([repo("web-shop")]);
    await page.goto(`/projects/${projectId}/settings/repository`);
    await page.getByRole("radio", { name: /acme\/web-shop/ }).check();
    await failGitHub(bearer === "app" ? "app" : token, fault);
    await page.getByRole("button", { name: "Connect repository" }).click();

    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await clearGitHubFaults(bearer === "app" ? "app" : token);
    await page.getByRole("button", { name: "Connect repository" }).click();
    await expect(page.getByRole("link", { name: /acme\/web-shop/ })).toBeVisible();
  });
}

for (const [label, method, failure, message] of [
  ["the API fails while connecting", "PUT", { status: 500 }, "The repository could not be connected. Please try again."],
  ["the API is unreachable while connecting", "PUT", { close: true }, "The repository could not be connected. Please try again."],
  ["the API says the user is not the owner", "PUT", { status: 403, body: { detail: "Only the project owner can do this." } }, "Only the project owner can do this."],
  ["the API says the project is archived", "PUT", { status: 409, body: { detail: "Archived items cannot be changed." } }, "This project is archived, so its repository can't be changed."],
  ["the API answers with something that is not a connection", "PUT", { status: 200, body: { repository: null } }, "The repository could not be connected. Please try again."],
] as const) {
  test(`connecting explains the failure when ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Checkout");
    await gitHubWith([repo("web-shop")]);
    await page.goto(`/projects/${projectId}/settings/repository`);
    await page.getByRole("radio", { name: /acme\/web-shop/ }).check();
    await failApi(owner.userId, { method, path: `^/projects/${projectId}/repository$`, ...failure });
    await page.getByRole("button", { name: "Connect repository" }).click();
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
  });
}

for (const [label, failure, message] of [
  ["fails", { status: 500 }, "The repository could not be disconnected. Please try again."],
  ["is unreachable", { close: true }, "The repository could not be disconnected. Please try again."],
  ["says the user is not the owner", { status: 403, body: { detail: "Only the project owner can do this." } }, "Only the project owner can do this."],
] as const) {
  test(`disconnecting keeps the connection and explains the failure when the API ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Checkout");
    await gitHubWith([repo("web-shop")]);
    await page.goto(`/projects/${projectId}/settings/repository`);
    await page.getByRole("radio", { name: /acme\/web-shop/ }).check();
    await page.getByRole("button", { name: "Connect repository" }).click();
    await expect(page.getByRole("link", { name: /acme\/web-shop/ })).toBeVisible();

    await failApi(owner.userId, { method: "DELETE", path: `^/projects/${projectId}/repository$`, ...failure });
    await page.getByRole("button", { name: "Disconnect repository" }).click();
    await page.getByRole("button", { name: "Yes, disconnect" }).click();
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await clearApiFaults(owner.userId);
    await page.reload();
    await expect(page.getByRole("link", { name: /acme\/web-shop/ })).toBeVisible();
  });
}

test("the repository page shows the error inside the project frame when the connection cannot be read", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  for (const failure of [{ status: 500 }, { status: 200, body: {} }, { close: true }] as const) {
    await failApi(owner.userId, { method: "GET", path: `^/projects/${projectId}/repository$`, ...failure });
    await page.goto(`/projects/${projectId}/settings/repository`);
    await expect(page.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Checkout" })).toBeVisible();
    await clearApiFaults(owner.userId);
  }
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Repository", level: 1 })).toBeVisible();
});

test("other users cannot see a project's repository page", async ({ page, browser }) => {
  const projectId = await createProject(page, "Private");
  const other = await browser.newContext();
  await other.addCookies([(await createTestSession("Other user")).cookie]);
  const otherPage = await other.newPage();
  await otherPage.goto(`/projects/${projectId}/settings/repository`);
  await expect(otherPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await other.close();
});
