import type { Browser, BrowserContext, Page } from "@playwright/test";
import { addTestTeamMember, createTestSession, createTestTeam, expect, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";

// Requirement discussion (ADR-059). The Owner writes a requirement; an Observer, signed in in a
// separate browser context, raises a question without changing the review status.
let owner: Awaited<ReturnType<typeof createTestSession>>;
let observer: Awaited<ReturnType<typeof createTestSession>>;
const contexts: BrowserContext[] = [];
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Ada Lovelace");
  await createTestTeam(owner.userId);
  observer = await createTestSession("Angela Instructor");
  await context.addCookies([owner.cookie]);
});
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  await clearApiFaults(owner.userId);
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
  await addTestTeamMember(projectId, observer.userId, "observer");
  return page.url();
}

async function asObserver(browser: Browser, url: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  contexts.push(context);
  await context.addCookies([observer.cookie]);
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Comments", exact: true })).toBeVisible();
  return page;
}

const comments = (page: Page) => page.getByRole("list", { name: "Comments" });

test("an Observer comments without changing the review; the author replies, edits, and the Owner moderates", async ({ page, browser }, testInfo) => {
  const url = await createRequirement(page);
  await expect(page.getByText("No comments yet.")).toBeVisible();

  const angela = await asObserver(browser, url);
  // Observers can't decide (ADR-058) but can discuss.
  await expect(angela.getByRole("button", { name: "Record decision" })).toHaveCount(0);
  await expect(angela.getByText("Comments don't change the requirement, its evidence, or its review status.")).toBeVisible();
  const review = angela.getByRole("region", { name: "Review", exact: true });
  await expect(review).toContainText("No decision has been recorded yet.");
  // A refused comment keeps the draft.
  await angela.getByLabel("Add a comment").fill("   ");
  await angela.getByRole("button", { name: "Post comment" }).click();
  await expect(angela.getByRole("form", { name: "New comment" }).getByRole("alert")).toHaveText("Write a comment first.");
  await expect(angela.getByLabel("Add a comment")).toHaveValue("   ");
  await angela.getByLabel("Add a comment").fill("Will this be demoed\nat sprint review?");
  await angela.getByRole("button", { name: "Post comment" }).click();
  const question = comments(angela).getByRole("article", { name: "Comment by You" });
  await expect(question).toContainText("Will this be demoed\nat sprint review?");
  await expect(question.locator("time").first()).toBeVisible();
  await expect(angela.getByLabel("Add a comment")).toHaveValue("");
  await expect(angela.getByText("notification emails couldn’t be sent")).toHaveCount(0);
  await angela.reload();
  await expect(review).toContainText("No decision has been recorded yet.");
  // Observers delete their own comments but not other people's, and can't edit others'.
  await expect(question.getByRole("button", { name: "Edit" })).toBeVisible();

  await page.reload();
  const fromAngela = comments(page).getByRole("article", { name: "Comment by Angela Instructor" });
  await expect(fromAngela).toContainText("Will this be demoed");
  await expect(fromAngela.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(fromAngela.getByRole("button", { name: "Delete" })).toBeVisible(); // The Owner moderates.
  await fromAngela.getByRole("button", { name: "Reply" }).click();
  await page.getByLabel("Reply to Angela Instructor").fill("Yes, in the second demo.");
  await page.getByRole("button", { name: "Post reply" }).click();
  const replies = page.getByRole("list", { name: "Replies to Angela Instructor" });
  const reply = replies.getByRole("article", { name: "Reply by You" });
  await expect(reply).toContainText("Yes, in the second demo.");
  await expect(page.getByLabel("Reply to Angela Instructor")).toHaveCount(0);

  await reply.getByRole("button", { name: "Edit" }).click();
  // A refused edit keeps the editor open with the typed text.
  await page.getByLabel("Edit reply").fill("  ");
  await reply.getByRole("button", { name: "Save reply", exact: true }).click();
  await expect(reply.getByRole("alert")).toHaveText("A comment can’t be empty. Delete it instead.");
  await expect(page.getByLabel("Edit reply")).toHaveValue("  ");
  await page.getByLabel("Edit reply").fill("Yes, in the first demo.");
  await reply.getByRole("button", { name: "Save reply", exact: true }).click();
  await expect(reply).toContainText("Yes, in the first demo.");
  await expect(reply).toContainText("Edited");

  await page.screenshot({ path: testInfo.outputPath("comments-desktop.png"), fullPage: true });

  // Deleting the question keeps the reply under a placeholder.
  await fromAngela.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(fromAngela).toBeVisible();
  await fromAngela.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete comment", exact: true }).click();
  await expect(comments(page).getByRole("article", { name: "Deleted comment" })).toContainText("This comment was deleted.");
  await expect(reply).toBeVisible();

  await page.goto(`${url}/history`);
  const history = page.getByRole("list", { name: "Comment changes" });
  await expect(history.getByRole("listitem")).toHaveText([
    /^Ada Lovelace deleted Angela Instructor’s comment on /,
    /^Ada Lovelace edited their reply on /,
    /^Ada Lovelace replied to a comment on /,
    /^Angela Instructor commented on /,
  ]);
  await expect(page.getByText("Will this be demoed")).toHaveCount(0); // Removed text isn't kept.
});

test("the discussion stays readable and usable on a phone", async ({ page, browser }, testInfo) => {
  const url = await createRequirement(page);
  const angela = await asObserver(browser, url, { width: 390, height: 844 });
  await angela.getByLabel("Add a comment").fill(`A long question ${"without-breaks-".repeat(20)}`);
  await angela.getByRole("button", { name: "Post comment" }).click();
  await expect(comments(angela).getByRole("article", { name: "Comment by You" })).toBeVisible();
  await comments(angela).getByRole("button", { name: "Reply" }).focus();
  await angela.keyboard.press("Enter");
  await expect(angela.getByLabel("Reply to You")).toBeVisible();
  expect(await angela.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await angela.screenshot({ path: testInfo.outputPath("comments-mobile.png"), fullPage: true });
});

test("a saved comment whose reply can't be read is still reported as posted, not as a failure to retry", async ({ page }) => {
  await createRequirement(page);
  await failApi(owner.userId, { method: "POST", path: "/comments$", status: 201, body: { unexpected: true }, times: 1 });
  await page.getByLabel("Add a comment").fill("Saved, but the answer is garbled");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your comment was posted, but notification emails couldn’t be sent." })).toBeVisible();
  await expect(page.getByLabel("Add a comment")).toHaveValue("");
  await expect(page.getByRole("form", { name: "New comment" }).getByRole("alert")).toHaveCount(0);
});
