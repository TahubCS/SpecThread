import { createTestSession, createTestTeam, expect, test } from "./fixtures";

// Plain-language explanations on the requirement page (US-17).
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  const reader = await createTestSession("Glossary reader");
  await createTestTeam(reader.userId);
  await context.addCookies([reader.cookie]);
});

async function createRequirement(page: import("@playwright/test").Page) {
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
}

test("technical words in the evidence rule explain themselves, by keyboard and by mouse", async ({ page }, testInfo) => {
  await createRequirement(page);
  const rule = page.getByRole("list", { name: "Evidence complete rule" });
  // The rule reads exactly as before; the words are buttons.
  await expect(rule.getByRole("listitem")).toHaveText([
    "A linked issueMissing", "A merged pull requestMissing", "Checks passed on the final commit of each merged pull requestMissing",
    "A linked release that includes each merged pull requestMissing",
  ]);
  const pullRequest = rule.getByRole("button", { name: "pull request: what does this mean?" });
  await expect(pullRequest).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("note")).toHaveCount(0);

  await pullRequest.focus();
  await page.keyboard.press("Enter");
  await expect(pullRequest).toHaveAttribute("aria-expanded", "true");
  const note = page.getByRole("note");
  await expect(note).toHaveText("Pull request: A proposed set of code changes, submitted so others can review them before they are added to the main code.");
  await expect(pullRequest).toHaveAttribute("aria-controls", (await note.getAttribute("id"))!);
  await page.screenshot({ path: testInfo.outputPath("term-explanation.png") });
  await page.keyboard.press("Escape");
  await expect(note).toHaveCount(0);

  await rule.getByRole("button", { name: "Checks passed: what does this mean?" }).click();
  await expect(page.getByRole("note")).toContainText("not that every possible situation works");
  await page.getByRole("heading", { name: "Guest checkout", level: 1 }).click();
  await expect(page.getByRole("note")).toHaveCount(0);

  // At phone width the explanation stays on screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await rule.getByRole("button", { name: "release: what does this mean?" }).click();
  await page.getByRole("note").scrollIntoViewIfNeeded();
  await expect(page.getByRole("note")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a folded glossary explains every term and status label on the page", async ({ page }) => {
  await createRequirement(page);
  const list = page.getByRole("definition");
  await expect(list.first()).toBeHidden();
  await page.getByText("What do these words mean?").click();
  await expect(page.getByRole("term")).toHaveText([
    "Issue", "Pull request", "Merged", "Commit", "Check", "Release", "Linked", "Check passed", "Evidence complete", "Accepted",
  ]);
  await expect(list.filter({ hasText: "An automated test or tool" })).toBeVisible();
  await expect(list.last()).toHaveText("A person with the right role reviewed the evidence and approved the requirement.");
});
