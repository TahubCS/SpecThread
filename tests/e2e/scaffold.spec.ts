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

test("about groups the informational pages", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "About SpecThread" })).toBeVisible();

  for (const [name, route] of [
    ["How SpecThread works", "/about/how-it-works"],
    ["Privacy", "/about/privacy"],
    ["Terms of use", "/about/terms"],
  ] as const) {
    await page.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await page.goto("/about");
  }
});

test("projects includes personal and team-owned projects in its routing scope", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByText("Browse your personal projects and projects shared through teams.")).toBeVisible();
  await page.goto("/projects/new");
  await expect(page.getByText("Create a personal project or choose a team to own it.")).toBeVisible();
});

test("standalone search is not part of the route map", async ({ page }) => {
  const response = await page.goto("/search");
  expect(response?.status()).toBe(404);
});
