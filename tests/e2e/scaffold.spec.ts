import { expect, test } from "@playwright/test";

const routes = [
  ["/teams", "Teams"],
  ["/teams/team-1/projects", "Team projects"],
  ["/projects", "Projects"],
  ["/projects/project-1/settings/repository", "Repository settings"],
  ["/projects/project-1/requirements/requirement-1/evidence", "Evidence thread"],
  ["/projects/project-1/requirements/requirement-1/review", "Review requirement"],
  ["/invites/example-token", "Invitation"],
  ["/settings/account", "Account settings"],
  ["/projects/project-1/matrix", "Traceability matrix"],
] as const;

test("scaffold navigation reaches the main product areas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Teams" }).click();
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByRole("heading", { name: "Teams", level: 1 })).toBeVisible();
  await expect(page.getByText("Product data and actions are not connected yet.")).toBeVisible();
});

test("representative scaffold routes render without product data", async ({ page }) => {
  for (const [route, heading] of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText("Product data and actions are not connected yet.")).toBeVisible();
  }
});

test("unknown routes show a useful not-found page", async ({ page }) => {
  const response = await page.goto("/not-a-specthread-route");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
});
