import type { Page } from "@playwright/test";
import { createTestSession, createTestTeam, expect, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";

// Marking a requirement as a follow-up of another (ADR-052). Each test uses its own new user.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Danielle Tech");
  await createTestTeam(owner.userId);
  await context.addCookies([owner.cookie]);
});
test.afterEach(() => clearApiFaults(owner.userId));

/** Creates a project with requirements of the given titles and returns their addresses. */
async function createRequirements(page: Page, titles: string[]) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Box");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = page.url().split("/").at(-1)!;
  const urls: string[] = [];
  for (const title of titles) {
    await page.goto(`/projects/${projectId}/requirements/new`);
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Criterion 1", { exact: true }).fill("Done");
    await page.getByRole("button", { name: "Create requirement" }).click();
    await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
    urls.push(page.url());
  }
  return { projectId, urls };
}

test("a follow-up link shows on both requirements, and adding and removing it are recorded", async ({ page }, testInfo) => {
  const { urls: [original, followUp] } = await createRequirements(page, ["Box opens", "Box opens faster"]);
  await page.goto(followUp);
  await expect(page.getByText("This requirement doesn't follow up another requirement.")).toBeVisible();
  await page.getByLabel("Mark as a follow-up of").selectOption({ label: "Box opens" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const followUpOf = page.getByRole("list", { name: "Follow-up of" });
  await expect(followUpOf.getByRole("link")).toContainText("Box opens");
  await expect(followUpOf).toContainText("Linked by Danielle Tech");
  // Nothing is left to link, and the version did not change.
  await expect(page.getByText("There are no other active requirements in this project to link.")).toBeVisible();
  await expect(page.getByText(/^Version 1 ·/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("follow-up.png"), fullPage: true });

  await followUpOf.getByRole("link", { name: /Box opens/ }).click();
  await expect(page).toHaveURL(original);
  const followedUpBy = page.getByRole("list", { name: "Followed up by" });
  await expect(followedUpBy.getByRole("link")).toContainText("Box opens faster");
  await followedUpBy.getByRole("link", { name: /Box opens faster/ }).click();
  await expect(page).toHaveURL(followUp);

  await page.getByRole("button", { name: "Remove follow-up link to Box opens" }).click();
  await expect(page.getByText("This requirement doesn't follow up another requirement.")).toBeVisible();
  await page.getByText("2 link changes").click();
  const changes = page.getByRole("list", { name: "Follow-up link changes" }).getByRole("listitem");
  await expect(changes.nth(0)).toContainText("Unmarked as a follow-up of “Box opens” by Danielle Tech");
  await expect(changes.nth(1)).toContainText("Marked as a follow-up of “Box opens” by Danielle Tech");

  await page.goto(`${original}/history`);
  await expect(page.getByRole("heading", { name: "Requirement history", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Follow-up link changes" }).getByRole("listitem").nth(0))
    .toContainText("“Box opens faster” was unmarked as a follow-up of this requirement");
});

test("a failed or refused link is explained and nothing is linked", async ({ page }) => {
  const { urls: [, followUp] } = await createRequirements(page, ["Box opens", "Box opens faster"]);
  const requirementId = followUp.split("/").at(-1)!;
  await page.goto(followUp);
  await failApi(owner.userId, { method: "POST", path: `^/requirements/${requirementId}/follow-ups$`, status: 500, body: { status: 500 } });
  await page.getByLabel("Mark as a follow-up of").selectOption({ label: "Box opens" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const alert = page.getByRole("form", { name: "Add a follow-up link" }).getByRole("alert");
  await expect(alert).toHaveText("The follow-up link could not be added. Please try again.");
  await expect(page.getByRole("list", { name: "Follow-up of" })).toHaveCount(0);

  await clearApiFaults(owner.userId);
  await failApi(owner.userId, {
    method: "POST", path: `^/requirements/${requirementId}/follow-ups$`, status: 400,
    body: { errors: { originalRequirementId: ["That requirement is already a follow-up of this one."] } },
  });
  await page.getByLabel("Mark as a follow-up of").selectOption({ label: "Box opens" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(alert).toHaveText("That requirement is already a follow-up of this one.");
});
