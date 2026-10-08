import type { Page } from "@playwright/test";
import { createTestSession, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults, failApi, type ApiFault } from "../support/api-faults";

// How the project pages behave when the API fails. Faults are registered with the test API
// proxy for this test's own user, so other tests keep talking to a healthy API.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Failure tester");
  await context.addCookies([owner.cookie]);
});
test.afterEach(() => clearApiFaults(owner.userId));

type Failure = Pick<ApiFault, "status" | "body" | "close">;
const serverError: Failure = { status: 500, body: { title: "Internal Server Error", status: 500 } };
const unreachable: Failure = { close: true };

async function createProject(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

const expectErrorPage = (page: Page) => expect(page.getByRole("heading", { name: "Page unavailable" })).toBeVisible();

test("the project list shows an error page, and Try again recovers once the API is back", async ({ page }) => {
  await failApi(owner.userId, { method: "GET", path: "^/projects$", ...serverError });
  await page.goto("/projects");
  await expectErrorPage(page);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toHaveCount(0);

  await clearApiFaults(owner.userId);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("You have no projects yet.")).toBeVisible();
});

for (const [label, failure] of [
  ["is unreachable", unreachable],
  ["answers with something that is not a project list", { status: 200, body: { items: [] } }],
  ["rejects the token", { status: 401 }],
] as const) {
  test(`the project list shows an error page when the API ${label}`, async ({ page }) => {
    await failApi(owner.userId, { method: "GET", path: "^/projects$", ...failure });
    await page.goto("/projects");
    await expectErrorPage(page);
  });
}

for (const [label, failure] of [
  ["fails", serverError],
  ["is unreachable", unreachable],
  ["refuses the account", { status: 403, body: { detail: "The signed-in user has no account record.", status: 403 } }],
  ["answers with something that is not a project", { status: 201, body: {} }],
] as const) {
  test(`creating a project keeps the name and explains the failure when the API ${label}`, async ({ page }) => {
    await failApi(owner.userId, { method: "POST", path: "^/projects$", ...failure });
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill("Checkout");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "The project could not be created. Please try again." })).toBeVisible();
    await expect(page.getByLabel("Project name")).toHaveValue("Checkout");
    await expect(page).toHaveURL(/\/projects\/new$/);

    await clearApiFaults(owner.userId);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
  });
}

test("creating a project shows the API's own message for a rejected name", async ({ page }) => {
  await failApi(owner.userId, { method: "POST", path: "^/projects$", status: 400, body: { errors: { name: ["That name is not allowed."] } } });
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Checkout");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That name is not allowed." })).toBeVisible();
  await expect(page.getByLabel("Project name")).toHaveAttribute("aria-invalid", "true");
});

test("a project page shows the error page when any of its API calls fails", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  for (const [route, path, failure] of [
    [`/projects/${projectId}`, `^/projects/${projectId}$`, serverError],
    [`/projects/${projectId}`, `^/projects/${projectId}/requirements$`, unreachable],
    [`/projects/${projectId}`, `^/projects/${projectId}/members$`, { status: 200, body: [{ userId: 1 }] }],
    [`/projects/${projectId}/requirements`, `^/projects/${projectId}/requirements$`, { status: 200, body: [{ id: "r" }] }],
    [`/projects/${projectId}/settings`, `^/projects/${projectId}$`, unreachable],
  ] as const) {
    await failApi(owner.userId, { method: "GET", path, ...failure });
    await page.goto(route);
    await expectErrorPage(page);
    // The frame stays when only a section fails; nothing of the project shows when the project itself fails.
    const frame = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Checkout" });
    await expect(frame, `${route} ${path}`).toHaveCount(path.endsWith(`${projectId}$`) ? 0 : 1);
    await clearApiFaults(owner.userId);
  }
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: "Checkout", level: 1 })).toBeVisible();
});

for (const [label, failure, message] of [
  ["fails", serverError, "The name could not be saved. Please try again."],
  ["is unreachable", unreachable, "The name could not be saved. Please try again."],
  ["no longer finds the project", { status: 404 }, "The name could not be saved. Please try again."],
  ["says the user is not the owner", { status: 403, body: { detail: "Only the project owner can do this." } }, "Only the project owner can do this."],
  ["says the project is archived", { status: 409, body: { detail: "Archived items cannot be changed." } }, "This project is archived and can't be renamed."],
  ["rejects the name", { status: 400, body: { errors: { name: ["That name is not allowed."] } } }, "That name is not allowed."],
] as const) {
  test(`renaming keeps the old name and explains the failure when the API ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Old name");
    await page.goto(`/projects/${projectId}/settings`);
    await failApi(owner.userId, { method: "PATCH", path: `^/projects/${projectId}$`, ...failure });
    await page.getByLabel("Project name").fill("New name");
    await page.getByRole("button", { name: "Save name" }).click();

    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toHaveCount(0);
    await expect(page.getByLabel("Project name")).toHaveValue("New name");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Old name" })).toBeVisible();
  });
}

for (const [label, failure, message] of [
  ["fails", serverError, "The project could not be archived. Please try again."],
  ["is unreachable", unreachable, "The project could not be archived. Please try again."],
  ["says the user is not the owner", { status: 403, body: { detail: "Only the project owner can do this." } }, "Only the project owner can do this."],
] as const) {
  test(`archiving leaves the project active and explains the failure when the API ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Keep me");
    await page.goto(`/projects/${projectId}/settings`);
    await failApi(owner.userId, { method: "POST", path: `^/projects/${projectId}/archive$`, ...failure });
    await page.getByRole("button", { name: "Archive project" }).click();
    await page.getByRole("button", { name: "Yes, archive this project" }).click();

    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/settings$`));
    await clearApiFaults(owner.userId);
    await page.goto("/projects");
    await expect(page.getByRole("list", { name: "Your projects" }).getByRole("link", { name: /Keep me/ })).toBeVisible();
  });
}

test("slow API calls show a loading message, and a project keeps its frame while a tab loads", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  await failApi(owner.userId, { method: "GET", path: "^/projects$", delayMs: 2500 });
  await page.goto("/projects", { waitUntil: "commit" });
  await expect(page.getByRole("status").filter({ hasText: "Loading..." })).toBeVisible();
  await expect(page.getByRole("list", { name: "Your projects" })).toBeVisible();

  await page.goto(`/projects/${projectId}`);
  await failApi(owner.userId, { method: "GET", path: `^/projects/${projectId}/requirements$`, delayMs: 2500 });
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Requirements" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loading..." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("This project has no requirements yet.")).toBeVisible();
});

test("a session that ended sends the user to sign in instead of creating a project", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("After sign-out");
  await runTestSql(`DELETE FROM public.session WHERE "userId" = '${owner.userId}'`);
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/login\?next=/);
  // The statement raises, and so fails the test, if a project was created anyway.
  await runTestSql(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.projects WHERE owner_user_id = '${owner.userId}')
    THEN RAISE EXCEPTION 'A project was created without a session'; END IF; END $$;`);
});

test("a member removed while viewing a project sees not-found on the next page", async ({ page, browser }) => {
  const projectId = await createProject(page, "Shared");
  const member = await createTestSession("Grace Hopper");
  await runTestSql(`INSERT INTO public.project_members (project_id,user_id) VALUES ('${projectId}','${member.userId}')`);
  const context = await browser.newContext();
  await context.addCookies([member.cookie]);
  const memberPage = await context.newPage();
  await memberPage.goto(`/projects/${projectId}`);
  await expect(memberPage.getByRole("heading", { name: "Shared", level: 1 })).toBeVisible();

  await runTestSql(`DELETE FROM public.project_members WHERE project_id = '${projectId}' AND user_id = '${member.userId}'`);
  await memberPage.goto(`/projects/${projectId}/requirements`);
  await expect(memberPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(memberPage.getByText("Shared")).toHaveCount(0);
  await context.close();
});
