import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createTestSession, expect, test } from "./fixtures";

let session: Awaited<ReturnType<typeof createTestSession>>;
let runSql: (sql: string) => void;
let teamId: string;

test.beforeEach(async ({ context }) => {
  session = await createTestSession("Projects owner");
  await context.clearCookies();
  await context.addCookies([session.cookie]);
  const { name } = JSON.parse(await readFile("playwright/.cache/test-web-database.json", "utf8"));
  runSql = sql => execFileSync("docker", ["exec", "-u", "postgres", name, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "ignore" });
  teamId = randomUUID();
  runSql(`INSERT INTO teams(id,name,description,owner_user_id) VALUES ('${teamId}','Project team','Our projects','${session.userId}');
    INSERT INTO team_members(team_id,user_id) VALUES ('${teamId}','${session.userId}');`);
});
test.afterEach(() => {
  if (runSql && teamId) runSql(`DELETE FROM acceptance_criteria WHERE requirement_id IN (SELECT id FROM requirements WHERE project_id IN (SELECT id FROM projects WHERE team_id='${teamId}'));
    DELETE FROM requirements WHERE project_id IN (SELECT id FROM projects WHERE team_id='${teamId}');
    DELETE FROM projects WHERE team_id='${teamId}';`);
  session?.remove();
});

test("team Projects shows only its active projects and the archive shows only its archived projects", async ({ page }, testInfo) => {
  await page.goto(`/teams/${teamId}/projects`);
  await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
  const active = randomUUID();
  const archived = randomUUID();
  const requirement = randomUUID();
  runSql(`INSERT INTO projects(id,name,owner_user_id,team_id,created_at,archived_at) VALUES
    ('${active}','Checkout','${session.userId}','${teamId}','2025-01-01',null),
    ('${archived}','Old billing','${session.userId}','${teamId}','2025-02-01',now());
    INSERT INTO requirements(id,project_id,title,description,created_by) VALUES ('${requirement}','${active}','Pay once','','${session.userId}');`);
  await page.reload();
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Project", "Requirements", "Created"]);
  await expect(table.getByRole("link", { name: "Checkout" })).toHaveAttribute("href", `/projects/${active}`);
  await expect(table.getByRole("row").nth(1).getByRole("cell")).toHaveText(["Checkout", "1", "Jan 1, 2025"]);
  await expect(table).not.toContainText("Old billing");
  await page.screenshot({ path: testInfo.outputPath("team-projects-desktop.png"), fullPage: true });
  const group = page.getByRole("region", { name: "Project team", exact: true });
  await expect(group.getByRole("link", { name: "Projects", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("main").getByRole("link", { name: "Open archive" }).click();
  await expect(page.getByRole("heading", { name: "Archived projects", exact: true })).toBeVisible();
  await expect(table.getByRole("link", { name: "Old billing" })).toHaveAttribute("href", `/projects/${archived}`);
  await expect(table).not.toContainText("Checkout");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("team-archive-mobile.png"), fullPage: true });
  await table.getByRole("button", { name: "Restore", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Restore Old billing?", exact: true });
  await expect(confirmation).toContainText("Project team");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(table.getByRole("link", { name: "Old billing" })).toBeVisible();
  await table.getByRole("button", { name: "Restore", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("restore-project-mobile.png"), fullPage: true });
  await confirmation.getByRole("button", { name: "Restore project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No archived projects" })).toBeVisible();
  await page.getByRole("link", { name: "Back to projects" }).click();
  await expect(table.getByRole("link", { name: "Old billing" })).toBeVisible();
  await table.getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${active}$`));
});

test("archive restoration is hidden from Members and rechecks an Admin's current permission", async ({ page, context }) => {
  const admin = await createTestSession("Archive admin"), member = await createTestSession("Archive member");
  const project = randomUUID();
  try {
    runSql(`INSERT INTO team_members(team_id,user_id,role) VALUES ('${teamId}','${admin.userId}','admin'),('${teamId}','${member.userId}','member');
      INSERT INTO projects(id,name,owner_user_id,team_id,archived_at) VALUES ('${project}','Archived work','${session.userId}','${teamId}',now());`);
    await context.clearCookies(); await context.addCookies([member.cookie]);
    await page.goto(`/teams/${teamId}/archive`);
    await expect(page.getByRole("link", { name: "Archived work", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
    await context.clearCookies(); await context.addCookies([admin.cookie]);
    await page.goto(`/teams/${teamId}/archive`);
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Restore Archived work?", exact: true });
    runSql(`UPDATE team_members SET role='member' WHERE team_id='${teamId}' AND user_id='${admin.userId}';`);
    await dialog.getByRole("button", { name: "Restore project", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Owner");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.reload();
    await expect(page.getByRole("link", { name: "Archived work", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
    runSql(`UPDATE team_members SET role='admin' WHERE team_id='${teamId}' AND user_id='${admin.userId}';`);
    await page.reload();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await dialog.getByRole("button", { name: "Restore project", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No archived projects" })).toBeVisible();
  } finally { admin.remove(); member.remove(); }
});

test("team project and archive pages conceal data from another account", async ({ page, context }) => {
  const outsider = await createTestSession("Projects outsider");
  try {
    await context.clearCookies();
    await context.addCookies([outsider.cookie]);
    for (const suffix of ["projects", "archive"]) {
      await page.goto(`/teams/${teamId}/${suffix}`);
      await expect(page.getByRole("heading", { name: "Team not found" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Project team" })).toHaveCount(0);
    }
  } finally { outsider.remove(); }
});
