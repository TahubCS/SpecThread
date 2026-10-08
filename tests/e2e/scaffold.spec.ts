import { expect, test } from "./fixtures";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { navigationFor, scaffoldRoutes } from "../../app/web/src/lib/scaffold-routes";

const routes = [
  ["/teams", "Teams"],
  ["/teams/team-1/projects", "Team projects"],
  ["/invites/example-token", "Invitation"],
  ["/reviews", "My reviews"],
] as const;

test("scaffold navigation reaches the main product areas", async ({ page }, testInfo) => {
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Teams" }).click();
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByRole("heading", { name: "Teams", level: 1 })).toBeVisible();
  await expect(page.getByText("Product data and actions are not connected yet.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("teams-desktop.png"), fullPage: true });
});

test("planned pages keep their navigation and fit a narrow workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/teams");
  await expect(page.getByRole("status").getByText("Product data and actions are not connected yet.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Page navigation" }).getByRole("link", { name: "Create team" })).toBeVisible();
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

test("standalone search is not part of the route map", async ({ page }) => {
  const response = await page.goto("/search");
  expect(response?.status()).toBe(404);
});

test("route navigation walks the team pages and never offers a project that does not exist", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Teams", exact: true }).click();
  const pageNavigation = page.getByRole("navigation", { name: "Page navigation" });
  await pageNavigation.getByRole("link", { name: "Team overview (example route)" }).click();
  await pageNavigation.getByRole("link", { name: "Team projects" }).click();
  await expect(page).toHaveURL(/\/teams\/example-team\/projects$/);
  await expect(pageNavigation.getByRole("link", { name: "Projects", exact: true })).toBeVisible();
  await expect(pageNavigation.getByRole("link", { name: /Project overview/ })).toHaveCount(0);
});

test("planned-page links reuse a real project and skip project pages elsewhere", () => {
  const inside = navigationFor("/projects/p-1/requirements/r-1")!;
  expect(inside.parent).toEqual({ href: "/projects/p-1/requirements", label: "Requirements" });
  expect(inside.links).toContainEqual({ href: "/projects/p-1/requirements/r-1/evidence", label: "Evidence thread" });
  for (const path of ["/teams/t-1/projects", "/reviews", "/onboarding/repository", "/dashboard"]) {
    expect(navigationFor(path)!.links.filter(link => link.href.includes("example-project")), path).toEqual([]);
  }
});

test("every reserved page participates in navigation", async () => {
  const root = path.join(process.cwd(), "app/web/src/app");
  // Pages that no longer use the placeholder stay in the route catalog.
  const connected = ["dashboard", "settings/account", "projects", "projects/new", "projects/[projectId]",
    "projects/[projectId]/requirements", "projects/[projectId]/settings",
    "projects/[projectId]/requirements/new", "projects/[projectId]/requirements/[requirementId]",
    "projects/[projectId]/requirements/[requirementId]/edit",
  ].map(route => path.join(root, route, "page.tsx"));
  async function pagesIn(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async entry => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return pagesIn(fullPath);
      if (entry.name !== "page.tsx") return [];
      const contents = await readFile(fullPath, "utf8");
      if (!contents.includes("ScaffoldPage") && !connected.includes(fullPath)) return [];
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
