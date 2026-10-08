import type { Browser, BrowserContext, Page } from "@playwright/test";
import { createTestSession, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";
import { clearGitHubFaults, githubId, setGitHubItems, setGitHubUser, type FakeItem } from "../support/github";

// Recording a person's decision on a requirement (ADR-038). The author creates the requirement;
// a second member, added in the database, reviews it in their own browser context.
let author: Awaited<ReturnType<typeof createTestSession>>;
let reviewer: Awaited<ReturnType<typeof createTestSession>>;
const contexts: BrowserContext[] = [];
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  author = await createTestSession("Ada Lovelace");
  reviewer = await createTestSession("Grace Hopper");
  await context.addCookies([author.cookie]);
});
test.afterEach(async () => {
  await clearApiFaults(reviewer.userId);
  await clearGitHubFaults();
  for (const context of contexts.splice(0)) await context.close();
});

/** As the author, creates a project with one requirement, and adds the reviewer to the project. */
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
  await runTestSql(`INSERT INTO public.project_members (project_id,user_id) VALUES ('${projectId}','${reviewer.userId}')`);
  return { projectId, requirementId: page.url().split("/").at(-1)!, url: page.url() };
}

/** Opens the address as the reviewer, in a separate browser context. */
async function asReviewer(browser: Browser, url: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  contexts.push(context);
  await context.addCookies([reviewer.cookie]);
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  return page;
}

const current = (page: Page) => page.locator(".review-current");
const recordButton = (page: Page) => page.getByRole("button", { name: "Record decision" });
const note = (page: Page) => page.getByLabel(/^Note/);
const alert = (page: Page) => page.getByRole("form", { name: "Record a decision" }).getByRole("alert");
const needsReview = (page: Page) => page.getByText("It needs a new review.");
async function record(page: Page, choice: "Accept" | "Reject" | "Request more evidence", text?: string) {
  await page.getByRole("radio", { name: choice, exact: true }).check();
  if (text !== undefined) await note(page).fill(text);
  await recordButton(page).click();
  // The button reads "Recording..." until the attempt has finished.
  await expect(recordButton(page)).toBeEnabled();
}

test("the author is told another member has to review, and lists show the requirement as not reviewed", async ({ page }, testInfo) => {
  const { projectId } = await createRequirement(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  await expect(page.getByText("No decision has been recorded yet.")).toBeVisible();
  await expect(page.getByText("You created this requirement, so another member has to review it.")).toBeVisible();
  await expect(recordButton(page)).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("review-author.png"), fullPage: true });

  await page.goto(`/projects/${projectId}/requirements`);
  await expect(page.getByRole("list", { name: "Requirements" }).getByRole("listitem")).toContainText("Not reviewed");
});

test("another member records each decision, a reason is required to reject, and earlier decisions stay readable", async ({ page, browser }, testInfo) => {
  const { projectId, url } = await createRequirement(page);
  const review = await asReviewer(browser, url);
  await expect(review.getByText("No decision has been recorded yet.")).toBeVisible();
  await expect(review.getByText("You created this requirement")).toHaveCount(0);

  // Rejecting without a reason is refused, and the choice is kept.
  await record(review, "Reject");
  await expect(review.getByText("Say what is missing or wrong, so the team knows what to do next.")).toBeVisible();
  await expect(note(review)).toHaveAttribute("aria-invalid", "true");
  await expect(review.getByRole("radio", { name: "Reject", exact: true })).toBeChecked();
  await expect(current(review)).toHaveCount(0);

  await record(review, "Reject", "The cart is emptied\nwhen a guest pays.");
  await expect(current(review)).toContainText("Rejected");
  await expect(current(review)).toContainText("by Grace Hopper on");
  await expect(current(review)).toContainText("The cart is emptied");
  await expect(current(review)).toContainText("Reviewed version 1 with no evidence links");
  // The form is cleared for the next decision.
  await expect(note(review)).toHaveValue("");
  await expect(review.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(needsReview(review)).toHaveCount(0);

  await record(review, "Request more evidence", "Link the pull request.");
  await expect(current(review)).toContainText("More evidence requested");
  await expect(review.getByText("1 earlier decision", { exact: true })).toBeVisible();

  await record(review, "Accept");
  await expect(current(review)).toContainText("Accepted");
  await review.getByText("2 earlier decisions", { exact: true }).click();
  const earlier = review.getByRole("list", { name: "Earlier decisions" }).getByRole("listitem");
  await expect(earlier).toHaveCount(2);
  await expect(earlier.nth(0)).toContainText("More evidence requested");
  await expect(earlier.nth(0)).toContainText("Link the pull request.");
  await expect(earlier.nth(1)).toContainText("Rejected");
  await expect(earlier.nth(1)).toContainText("The cart is emptied");
  await review.screenshot({ path: testInfo.outputPath("review-history.png"), fullPage: true });

  // The author reads the decision, and both lists show it.
  await page.reload();
  await expect(current(page)).toContainText("Accepted");
  await expect(current(page)).toContainText("by Grace Hopper on");
  await page.goto(`/projects/${projectId}/requirements`);
  await expect(page.getByRole("list", { name: "Requirements" }).getByRole("listitem")).toContainText("Accepted");
  await page.screenshot({ path: testInfo.outputPath("review-list.png"), fullPage: true });
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("list", { name: "Recent requirements" }).getByRole("listitem")).toContainText("Accepted");
});

test("a decision is outdated after an edit or a change of evidence links, and not after a refresh from GitHub", async ({ page, browser }, testInfo) => {
  const { projectId, url } = await createRequirement(page);
  const [installationId, repositoryId] = [githubId(), githubId()];
  const issue = (number: number, title: string): FakeItem =>
    ({ number, title, state: "open", user: "ada", created_at: `2026-09-${number}T10:00:00Z`, updated_at: "2026-10-01T10:00:00Z" });
  await setGitHubUser(`seed-${installationId}`, [{ id: installationId, repositories: [{ id: repositoryId, owner: "acme", name: "web" }] }]);
  await setGitHubItems(repositoryId, [issue(12, "Guests cannot pay"), issue(15, "Add guest checkout")]);
  await runTestSql(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
    VALUES ('${projectId}',${installationId},${repositoryId},'acme','web',false,'${author.userId}')`);
  const review = await asReviewer(browser, url);
  const link = async (text: string) => {
    await review.getByLabel(/Link an issue, pull request, commit, or release from/).fill(text);
    await review.getByRole("button", { name: "Link", exact: true }).click();
    await expect(review.getByRole("button", { name: "Link", exact: true })).toBeEnabled();
  };
  const rows = review.locator('ul[aria-label="Linked evidence"] > li');

  await link("12");
  await expect(rows).toHaveCount(1);
  await record(review, "Accept");
  await expect(current(review)).toContainText("Reviewed version 1 with 1 evidence link");
  await current(review).getByText("Reviewed version 1 with 1 evidence link").click();
  const reviewed = review.getByRole("list", { name: "Evidence reviewed" }).getByRole("listitem");
  await expect(reviewed).toHaveCount(1);
  await expect(reviewed).toContainText("#12");
  await expect(reviewed).toContainText("Guests cannot pay");
  await expect(needsReview(review)).toHaveCount(0);

  // Reading the same links again changes nothing about what was reviewed.
  await setGitHubItems(repositoryId, [{ ...issue(12, "Guests cannot pay (fixed)"), state: "closed", closed_at: "2026-10-06T10:00:00Z" }, issue(15, "Add guest checkout")]);
  await review.getByRole("button", { name: "Refresh from GitHub" }).click();
  await expect(rows.nth(0)).toContainText("Guests cannot pay (fixed)");
  await expect(needsReview(review)).toHaveCount(0);
  // The decision still shows the title that was reviewed.
  await expect(reviewed).toContainText("Guests cannot pay");
  await expect(reviewed).not.toContainText("(fixed)");

  await link("15");
  await expect(rows).toHaveCount(2);
  await expect(review.getByText("The evidence has changed since this decision.")).toBeVisible();
  await expect(review.getByText("earlier version of the requirement")).toHaveCount(0);
  await review.screenshot({ path: testInfo.outputPath("review-outdated.png"), fullPage: true });
  await page.goto(`/projects/${projectId}/requirements`);
  await expect(page.getByRole("list", { name: "Requirements" }).getByRole("listitem")).toContainText("Accepted, outdated");

  await review.getByRole("button", { name: "Remove link to #15" }).click();
  await expect(rows).toHaveCount(1);
  await expect(needsReview(review)).toHaveCount(0);

  await review.goto(`${url}/edit`);
  await review.getByLabel("Title").fill("Guest checkout v2");
  await review.getByRole("button", { name: "Save changes" }).click();
  await expect(review).toHaveURL(url);
  await expect(review.getByText("This decision was made on an earlier version of the requirement.")).toBeVisible();
  await expect(review.getByText("The evidence has changed since this decision.")).toHaveCount(0);

  // A new decision covers the current version.
  await record(review, "Accept", "Read again after the edit.");
  await expect(current(review)).toContainText("Reviewed version 2 with 1 evidence link");
  await expect(needsReview(review)).toHaveCount(0);
  await expect(review.getByText("1 earlier decision", { exact: true })).toBeVisible();
});

test("a decision on a requirement that changed while the form was open is refused and what was entered is kept", async ({ page, browser }) => {
  const { requirementId, url } = await createRequirement(page);
  const review = await asReviewer(browser, url);
  await runTestSql(`UPDATE public.requirements SET version = version + 1 WHERE id = '${requirementId}'`);

  await record(review, "Reject", "Not what we agreed.");
  await expect(alert(review)).toHaveText("This requirement changed since it was loaded. Reload it and review the current version.");
  await expect(review.getByRole("radio", { name: "Reject", exact: true })).toBeChecked();
  await expect(note(review)).toHaveValue("Not what we agreed.");

  await review.reload();
  await expect(review.getByText("No decision has been recorded yet.")).toBeVisible();
  await record(review, "Reject", "Not what we agreed.");
  await expect(current(review)).toContainText("Reviewed version 2");
});

test("an archived requirement keeps its decisions and takes no new one", async ({ page, browser }) => {
  const { requirementId, url } = await createRequirement(page);
  const review = await asReviewer(browser, url);
  await record(review, "Accept", "Matches the demo.");
  await expect(current(review)).toContainText("Accepted");

  // Archived while the form is open: the attempt is refused in words.
  await runTestSql(`UPDATE public.requirements SET archived_at = now() WHERE id = '${requirementId}'`);
  await record(review, "Reject", "Changed my mind.");
  await expect(alert(review)).toHaveText("Archived items cannot be changed.");

  await review.reload();
  await expect(current(review)).toContainText("Accepted");
  await expect(current(review)).toContainText("Matches the demo.");
  await expect(recordButton(review)).toHaveCount(0);
  await expect(review.getByRole("radio")).toHaveCount(0);
  await expect(review.getByText("another member has to review it")).toHaveCount(0);
});

test("a decision can be recorded with the keyboard on a narrow screen", async ({ page, browser }, testInfo) => {
  const { url } = await createRequirement(page);
  const review = await asReviewer(browser, url, { width: 390, height: 800 });
  await review.getByRole("radio", { name: "Accept", exact: true }).focus();
  await review.keyboard.press("ArrowRight");
  await expect(review.getByRole("radio", { name: "Reject", exact: true })).toBeChecked();
  await review.keyboard.press("Tab");
  await expect(note(review)).toBeFocused();
  await review.keyboard.type(`Missing ${"x".repeat(80)}`);
  await review.keyboard.press("Tab");
  await expect(recordButton(review)).toBeFocused();
  await review.keyboard.press("Enter");
  await expect(current(review)).toContainText("Rejected");
  await record(review, "Request more evidence", "Link the release.");
  await review.getByText("1 earlier decision", { exact: true }).click();
  expect(await review.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await review.screenshot({ path: testInfo.outputPath("review-narrow.png"), fullPage: true });
});

test("a decision the API does not accept says why, keeps what was entered, and can be sent again", async ({ page, browser }) => {
  const { requirementId, url } = await createRequirement(page);
  const review = await asReviewer(browser, url);
  const path = `^/requirements/${requirementId}/reviews$`;
  const failed = "The decision could not be recorded. Please try again.";
  await review.getByRole("radio", { name: "Reject", exact: true }).check();
  await note(review).fill("Kept text");

  for (const [failure, message] of [
    [{ status: 500, body: { title: "Internal Server Error", status: 500 } }, failed],
    [{ close: true }, failed],
    [{ status: 404 }, failed],
    [{ status: 201, body: { id: 1 } }, failed],
    [{ status: 400, body: { errors: { version: ["Send the version you reviewed."] } } }, failed],
    [{ status: 403, body: { detail: "You created this requirement, so another project member has to review it." } }, "You created this requirement, so another project member has to review it."],
    [{ status: 400, body: { errors: { note: ["Use at most 2000 characters."] } } }, "Use at most 2000 characters."],
    [{ status: 400, body: { errors: { decision: ["Choose accept, reject, or request more evidence."] } } }, "Choose accept, reject, or request more evidence."],
  ] as const) {
    await failApi(reviewer.userId, { method: "POST", path, ...failure });
    await recordButton(review).click();
    await expect(alert(review), JSON.stringify(failure)).toHaveText(message);
    await expect(recordButton(review)).toBeEnabled();
    await expect(review.getByRole("radio", { name: "Reject", exact: true })).toBeChecked();
    await expect(note(review)).toHaveValue("Kept text");
    await clearApiFaults(reviewer.userId);
  }

  await recordButton(review).click();
  await expect(current(review)).toContainText("Rejected");
  await expect(current(review)).toContainText("Kept text");
  await expect(alert(review)).toHaveCount(0);
});

test("when decisions cannot be loaded the page says so and loads on another try", async ({ page, browser }) => {
  const { requirementId, url } = await createRequirement(page);
  const review = await asReviewer(browser, url);
  for (const failure of [{ status: 500 }, { close: true }, { status: 200, body: [{ id: "x", decision: "approved" }] }, { status: 200, body: {} }]) {
    await failApi(reviewer.userId, { method: "GET", path: `^/requirements/${requirementId}/reviews$`, ...failure });
    await review.goto(url);
    await expect(review.getByRole("heading", { name: "Page unavailable" }), JSON.stringify(failure)).toBeVisible();
    await expect(recordButton(review)).toHaveCount(0);
    await clearApiFaults(reviewer.userId);
    await review.getByRole("button", { name: "Try again" }).click();
    await expect(review.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  }

  // A list whose latest decision is not in the documented shape is not shown as if it were fine.
  await failApi(reviewer.userId, { method: "GET", path: "/requirements$", status: 200, body: [{
    id: requirementId, projectId: requirementId, title: "Guest checkout", version: 1, createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z", archivedAt: null, evidenceCount: 0, review: { decision: "verified", decidedBy: "x", decidedAt: "2026-10-01T10:00:00Z", outdated: false },
  }] });
  await review.goto(url.replace(/\/[0-9a-f-]{36}$/, ""));
  await expect(review.getByRole("heading", { name: "Page unavailable" })).toBeVisible();
});
