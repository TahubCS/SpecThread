import type { Page } from "@playwright/test";
import { createTestSession, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";

// Creating, reading, editing, and archiving requirements inside a project, and how those
// pages behave when the API refuses or fails. Each test uses its own new user.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Requirement tester");
  await context.addCookies([owner.cookie]);
});
test.afterEach(() => clearApiFaults(owner.userId));

async function createProject(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

/** Fills and submits the requirement form on the current page, then returns the new requirement's ID. */
async function createRequirement(page: Page, projectId: string, title: string, criteria: string[] = []) {
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill(title);
  for (const [index, text] of criteria.entries()) {
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByLabel(`Criterion ${index + 1}`, { exact: true }).fill(text);
  }
  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

test("a member creates a requirement with ordered criteria and finds it in the project", async ({ page }, testInfo) => {
  const projectId = await createProject(page, "Checkout");
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Requirements" }).click();
  await page.getByRole("link", { name: "New requirement" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/requirements/new$`));

  await page.getByLabel("Title").fill("  Guest checkout  ");
  await page.getByLabel("Description").fill("Let a shopper pay without an account.\nKeep the cart.");
  for (const [index, text] of ["Pay with a card as a guest", "Receive a receipt by email", "Remove me"].entries()) {
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByLabel(`Criterion ${index + 1}`, { exact: true }).fill(text);
  }
  await page.getByRole("button", { name: "Remove criterion 3" }).click();
  await page.screenshot({ path: testInfo.outputPath("requirement-form.png"), fullPage: true });
  await page.getByRole("button", { name: "Create requirement" }).click();

  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/requirements/[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name: "Guest checkout", level: 1 })).toBeVisible();
  await expect(page.getByText("Version 1")).toBeVisible();
  await expect(page.getByText("Created by Requirement tester")).toBeVisible();
  await expect(page.getByText("Let a shopper pay without an account.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Acceptance criteria" }).getByRole("listitem"))
    .toHaveText(["Pay with a card as a guest", "Receive a receipt by email"]);
  await page.screenshot({ path: testInfo.outputPath("requirement-detail.png"), fullPage: true });

  await page.getByRole("link", { name: "Requirements", exact: true }).first().click();
  await expect(page.getByRole("list", { name: "Requirements" }).getByRole("link", { name: /Guest checkout/ })).toBeVisible();
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("list", { name: "Recent requirements" }).getByRole("link", { name: /Guest checkout/ })).toBeVisible();
});

test("a requirement without a title or with a blank criterion is rejected next to the field", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill("   ");
  await page.getByRole("button", { name: "Add criterion" }).click();
  await page.getByLabel("Criterion 1", { exact: true }).fill("Kept");
  await page.getByRole("button", { name: "Add criterion" }).click();
  await page.getByRole("button", { name: "Create requirement" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Enter a title." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Enter the criterion or remove it." })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Criterion 2", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Criterion 1", { exact: true })).toHaveValue("Kept");
  await expect(page).toHaveURL(/\/requirements\/new$/);

  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByText("This project has no requirements yet.")).toBeVisible();
});

test("editing replaces the title, description, and criteria and raises the version", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  await createRequirement(page, projectId, "Guest checkout", ["First", "Second"]);
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Guest checkout");
  await expect(page.getByLabel("Criterion 2", { exact: true })).toHaveValue("Second");

  await page.getByLabel("Title").fill("Guest checkout v2");
  await page.getByLabel("Description").fill("Now with a description.");
  await page.getByRole("button", { name: "Remove criterion 1" }).click();
  await page.getByRole("button", { name: "Add criterion" }).click();
  await page.getByLabel("Criterion 2", { exact: true }).fill("Third");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { name: "Guest checkout v2", level: 1 })).toBeVisible();
  await expect(page.getByText("Version 2")).toBeVisible();
  await expect(page.getByText("Now with a description.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Acceptance criteria" }).getByRole("listitem")).toHaveText(["Second", "Third"]);
});

test("a save made after someone else saved is refused and nothing is overwritten", async ({ page, context }) => {
  const projectId = await createProject(page, "Checkout");
  const requirementId = await createRequirement(page, projectId, "Guest checkout");
  const edit = `/projects/${projectId}/requirements/${requirementId}/edit`;
  const second = await context.newPage();
  await second.goto(edit);
  await page.goto(edit);

  await second.getByLabel("Title").fill("Saved first");
  await second.getByRole("button", { name: "Save changes" }).click();
  await expect(second.getByRole("heading", { name: "Saved first", level: 1 })).toBeVisible();

  await page.getByLabel("Title").fill("Saved second");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Someone else saved this requirement while you were editing." })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Saved second");

  await page.goto(`/projects/${projectId}/requirements/${requirementId}`);
  await expect(page.getByRole("heading", { name: "Saved first", level: 1 })).toBeVisible();
  await expect(page.getByText("Version 2")).toBeVisible();
});

test("a requirement is archived only after confirming, then is read-only and off the list", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  const requirementId = await createRequirement(page, projectId, "Short lived", ["Only one"]);
  await page.getByRole("button", { name: "Archive requirement" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Yes, archive this requirement" })).toHaveCount(0);

  await page.getByRole("button", { name: "Archive requirement" }).click();
  await page.getByRole("button", { name: "Yes, archive this requirement" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/requirements$`));
  await expect(page.getByText("This project has no requirements yet.")).toBeVisible();

  await page.goto(`/projects/${projectId}/requirements/${requirementId}`);
  await expect(page.getByText(/This requirement was archived on/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive requirement" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Acceptance criteria" }).getByRole("listitem")).toHaveText(["Only one"]);
  await page.goto(`/projects/${projectId}/requirements/${requirementId}/edit`);
  await expect(page.getByText("This requirement is archived and can no longer be changed.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveCount(0);
});

test("an archived project keeps its requirements readable but offers no way to change them", async ({ page }) => {
  const projectId = await createProject(page, "Sunset");
  const requirementId = await createRequirement(page, projectId, "Still here");
  await runTestSql(`UPDATE public.projects SET archived_at = now() WHERE id = '${projectId}'`);

  await page.goto(`/projects/${projectId}/requirements`);
  await expect(page.getByRole("list", { name: "Requirements" }).getByRole("link", { name: /Still here/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "New requirement" })).toHaveCount(0);
  await page.goto(`/projects/${projectId}/requirements/new`);
  await expect(page.getByText("This project is archived, so requirements can't be added.")).toBeVisible();
  await page.goto(`/projects/${projectId}/requirements/${requirementId}`);
  await expect(page.getByRole("heading", { name: "Still here", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive requirement" })).toHaveCount(0);
  await page.goto(`/projects/${projectId}/requirements/${requirementId}/edit`);
  await expect(page.getByText("This requirement is archived and can no longer be changed.")).toBeVisible();
});

test("a project archived while a form is open refuses the save with an explanation", async ({ page }) => {
  const projectId = await createProject(page, "Sunset");
  const requirementId = await createRequirement(page, projectId, "Edit me");
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill("Too late");
  const edit = await page.context().newPage();
  await edit.goto(`/projects/${projectId}/requirements/${requirementId}/edit`);
  await edit.getByLabel("Title").fill("Also too late");
  await runTestSql(`UPDATE public.projects SET archived_at = now() WHERE id = '${projectId}'`);

  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This project is archived, so its requirements can't be changed." })).toBeVisible();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert").filter({ hasText: "This project is archived, so its requirements can't be changed." })).toBeVisible();
});

test("requirements are hidden from other users and from the wrong project's address", async ({ page, browser }) => {
  const projectId = await createProject(page, "Checkout");
  const requirementId = await createRequirement(page, projectId, "Private requirement");
  const otherProject = await createProject(page, "Billing");

  for (const path of [`/projects/${otherProject}/requirements/${requirementId}`, `/projects/${otherProject}/requirements/${requirementId}/edit`,
    `/projects/${projectId}/requirements/not-a-requirement`, `/projects/${projectId}/requirements/00000000-0000-4000-8000-000000000000`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
    await expect(page.getByText("Private requirement"), path).toHaveCount(0);
  }

  const other = await browser.newContext();
  await other.addCookies([(await createTestSession("Other user")).cookie]);
  const otherPage = await other.newPage();
  for (const path of [`/projects/${projectId}/requirements`, `/projects/${projectId}/requirements/new`,
    `/projects/${projectId}/requirements/${requirementId}`, `/projects/${projectId}/requirements/${requirementId}/edit`]) {
    await otherPage.goto(path);
    await expect(otherPage.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
    await expect(otherPage.getByText("Private requirement"), path).toHaveCount(0);
  }
  await other.close();
});

test("the requirement form works with the keyboard and fits a narrow screen", async ({ page }, testInfo) => {
  const projectId = await createProject(page, "Checkout");
  await page.setViewportSize({ width: 390, height: 844 });
  // Wait for the form to become interactive: text typed into it earlier would be reset.
  await page.goto(`/projects/${projectId}/requirements/new`, { waitUntil: "networkidle" });
  await page.getByLabel("Title").focus();
  await page.keyboard.type("Keyboard only");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Typed without a mouse.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Criterion 1", { exact: true })).toBeVisible();
  await page.getByLabel("Criterion 1", { exact: true }).focus();
  await page.keyboard.type("Reachable by keyboard");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("requirement-form-mobile.png"), fullPage: true });
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Keyboard only", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Acceptance criteria" }).getByRole("listitem")).toHaveText(["Reachable by keyboard"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const [label, failure, message] of [
  ["fails", { status: 500, body: { status: 500 } }, "The requirement could not be created. Please try again."],
  ["is unreachable", { close: true }, "The requirement could not be created. Please try again."],
  ["no longer finds the project", { status: 404 }, "The requirement could not be created. Please try again."],
  ["answers with something that is not a requirement", { status: 201, body: { id: 1 } }, "The requirement could not be created. Please try again."],
  ["rejects a field the form does not have", { status: 400, body: { errors: { version: ["Send the version you loaded."] } } }, "The requirement could not be created. Please try again."],
] as const) {
  test(`creating a requirement keeps the input and explains the failure when the API ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Checkout");
    await page.goto(`/projects/${projectId}/requirements/new`);
    await page.getByLabel("Title").fill("Guest checkout");
    await page.getByLabel("Description").fill("Kept text");
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByLabel("Criterion 1", { exact: true }).fill("Kept criterion");
    await failApi(owner.userId, { method: "POST", path: `^/projects/${projectId}/requirements$`, ...failure });
    await page.getByRole("button", { name: "Create requirement" }).click();

    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("Guest checkout");
    await expect(page.getByLabel("Description")).toHaveValue("Kept text");
    await expect(page.getByLabel("Criterion 1", { exact: true })).toHaveValue("Kept criterion");

    await clearApiFaults(owner.userId);
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page.getByRole("heading", { name: "Guest checkout", level: 1 })).toBeVisible();
  });
}

test("the API's own field messages appear next to the title and the right criterion", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill("Guest checkout");
  for (const index of [1, 2]) {
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByLabel(`Criterion ${index}`, { exact: true }).fill(`Criterion text ${index}`);
  }
  await failApi(owner.userId, { method: "POST", path: `^/projects/${projectId}/requirements$`, status: 400, body: { errors: {
    title: ["That title is not allowed."], description: ["That description is not allowed."],
    acceptanceCriteria: ["Too many for this plan."], "acceptanceCriteria[1]": ["That criterion is not allowed."],
  } } });
  await page.getByRole("button", { name: "Create requirement" }).click();

  for (const text of ["That title is not allowed.", "That description is not allowed.", "Too many for this plan.", "That criterion is not allowed."]) {
    await expect(page.getByRole("alert").filter({ hasText: text })).toBeVisible();
  }
  await expect(page.getByLabel("Criterion 2", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Criterion 1", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
});

for (const [label, failure] of [
  ["fails", { status: 500, body: { status: 500 } }],
  ["is unreachable", { close: true }],
  ["no longer finds the requirement", { status: 404 }],
  ["answers with something that is not a requirement", { status: 200, body: [] }],
] as const) {
  test(`saving a requirement keeps the input and the stored version when the API ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Checkout");
    const requirementId = await createRequirement(page, projectId, "Original title");
    await page.goto(`/projects/${projectId}/requirements/${requirementId}/edit`);
    await page.getByLabel("Title").fill("Changed title");
    await failApi(owner.userId, { method: "PUT", path: `^/requirements/${requirementId}$`, ...failure });
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "The requirement could not be saved. Please try again." })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("Changed title");
    await clearApiFaults(owner.userId);
    await page.goto(`/projects/${projectId}/requirements/${requirementId}`);
    await expect(page.getByRole("heading", { name: "Original title", level: 1 })).toBeVisible();
    await expect(page.getByText("Version 1")).toBeVisible();
  });
}

test("a refused save explains an archived requirement, and a failed follow-up check falls back to the general message", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  const requirementId = await createRequirement(page, projectId, "Archived elsewhere");
  await page.goto(`/projects/${projectId}/requirements/${requirementId}/edit`);
  await page.getByLabel("Title").fill("Too late");
  await runTestSql(`UPDATE public.requirements SET archived_at = now() WHERE id = '${requirementId}'`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This requirement is archived and can no longer be changed." })).toBeVisible();

  await failApi(owner.userId, { method: "GET", path: `^/requirements/${requirementId}$`, status: 500 });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The requirement could not be saved. Please try again." })).toBeVisible();
});

for (const [label, failure, message] of [
  ["fails", { status: 500, body: { status: 500 } }, "The requirement could not be archived. Please try again."],
  ["is unreachable", { close: true }, "The requirement could not be archived. Please try again."],
  ["says the project is archived", { status: 409, body: { detail: "Archived items cannot be changed." } }, "This project is archived, so its requirements can't be changed."],
] as const) {
  test(`archiving a requirement leaves it active and explains the failure when the API ${label}`, async ({ page }) => {
    const projectId = await createProject(page, "Checkout");
    const requirementId = await createRequirement(page, projectId, "Keep me");
    await failApi(owner.userId, { method: "POST", path: `^/requirements/${requirementId}/archive$`, ...failure });
    await page.getByRole("button", { name: "Archive requirement" }).click();
    await page.getByRole("button", { name: "Yes, archive this requirement" }).click();

    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await clearApiFaults(owner.userId);
    await page.goto(`/projects/${projectId}/requirements`);
    await expect(page.getByRole("list", { name: "Requirements" }).getByRole("link", { name: /Keep me/ })).toBeVisible();
  });
}

test("a requirement page that cannot load shows the error inside the project frame and recovers", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  const requirementId = await createRequirement(page, projectId, "Guest checkout");
  for (const [route, failure] of [
    [`/projects/${projectId}/requirements/${requirementId}`, { status: 500 }],
    [`/projects/${projectId}/requirements/${requirementId}`, { status: 200, body: { id: requirementId } }],
    [`/projects/${projectId}/requirements/${requirementId}/edit`, { close: true }],
  ] as const) {
    await failApi(owner.userId, { method: "GET", path: `^/requirements/${requirementId}$`, ...failure });
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Page unavailable" }), route).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Checkout" })).toBeVisible();
    await clearApiFaults(owner.userId);
  }
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Guest checkout");
});
