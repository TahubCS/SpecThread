import { expect, test } from "./fixtures";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { navigationFor, scaffoldRoutes } from "../../app/web/src/lib/scaffold-routes";

const routes = [
  ["/projects", "Projects"],
  ["/projects/project-1/settings/repository", "Repository settings"],
  ["/projects/project-1/requirements/requirement-1/evidence", "Evidence thread"],
  ["/projects/project-1/requirements/requirement-1/review", "Review requirement"],
  ["/projects/project-1/matrix", "Traceability matrix"],
] as const;

test("scaffold navigation reaches the main product areas", async ({ page }, testInfo) => {
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Teams" }).click();
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByRole("heading", { name: "Teams", level: 1 })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Create team", exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("teams-desktop.png"), fullPage: true });
});

test("planned pages keep their navigation and fit a narrow workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projects");
  await expect(page.getByRole("status").getByText("Product data and actions are not connected yet.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Create project" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test("route navigation connects projects, requirements, evidence, and review", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Project overview (example route)" }).click();
  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Requirements" }).click();
  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Requirement overview (example route)" }).click();
  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Evidence thread" }).click();
  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Back to Requirement overview" }).click();
  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Review requirement" }).click();
  await expect(page).toHaveURL(/\/projects\/example-project\/requirements\/example-requirement\/review$/);
});

test("every reserved page participates in navigation", async () => {
  const root = path.join(process.cwd(), "app/web/src/app");
  async function pagesIn(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async entry => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return pagesIn(fullPath);
      if (entry.name !== "page.tsx") return [];
      const contents = await readFile(fullPath, "utf8");
      if (!contents.includes("ScaffoldPage") && !fullPath.startsWith(path.join(root, "teams") + path.sep) && !fullPath.startsWith(path.join(root, "invites") + path.sep) && !fullPath.endsWith(`${path.sep}dashboard${path.sep}page.tsx`) &&
          !fullPath.endsWith(`${path.sep}settings${path.sep}account${path.sep}page.tsx`)) return [];
      return [`/${path.relative(root, directory).split(path.sep).join("/")}`];
    }));
    return nested.flat();
  }
  const pageRoutes = (await pagesIn(root)).sort();
  expect(pageRoutes).toEqual(scaffoldRoutes.map(([route]) => route).sort());
  for (const route of pageRoutes) {
    const examplePath = route.replace(/\[([^\]]+)\]/g, (_, key: string) => `example-${key}`);
    expect(navigationFor(examplePath), route).not.toBeNull();
  }
});
