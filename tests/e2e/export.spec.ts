import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { addTestTeamMember, createTestSession, createTestTeam, expect, test } from "./fixtures";

// Exporting requirements as a PDF (ADR-068, US-22).
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Export tester");
  await createTestTeam(owner.userId);
  await context.addCookies([owner.cookie]);
});

async function createProject(page: Page) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Checkout");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

async function createRequirement(page: Page, projectId: string, title: string, milestone: string) {
  await page.goto(`/projects/${projectId}/requirements/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Criterion 1", { exact: true }).fill(`${title} works`);
  await page.getByLabel("Milestone or sprint (optional)").fill(milestone);
  await page.getByRole("button", { name: "Create requirement" }).click();
  await expect(page).toHaveURL(/\/requirements\/[0-9a-f-]{36}$/);
}

test("a reviewer downloads one milestone's requirements as a PDF whose links lead back to SpecThread", async ({ page, browser }, testInfo) => {
  const projectId = await createProject(page);
  await createRequirement(page, projectId, "Guest pays", "Sprint 1");
  await createRequirement(page, projectId, "Order ships", "Sprint 2");

  // A client reviewer exports from the Requirements tab, with the milestone they were looking at.
  const reviewer = await createTestSession("Robert Client");
  await addTestTeamMember(projectId, reviewer.userId, "reviewer");
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  await context.addCookies([reviewer.cookie]);
  const client = await context.newPage();
  await client.goto(`/projects/${projectId}/requirements?milestone=Sprint+1`);
  await client.getByRole("link", { name: "Export PDF" }).click();
  await expect(client).toHaveURL(new RegExp(`/projects/${projectId}/exports\\?milestone=Sprint\\+1$`));
  await expect(client.getByRole("heading", { name: "Export as PDF", level: 1 })).toBeVisible();
  await expect(client.getByLabel("Requirements to include")).toHaveValue("Sprint 1");
  await client.screenshot({ path: testInfo.outputPath("export-page.png") });

  const [download] = await Promise.all([client.waitForEvent("download"), client.getByRole("button", { name: "Download PDF" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^checkout-sprint-1-\d{4}-\d{2}-\d{2}\.pdf$/);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getTitle()).toBe("Checkout: requirements export");
  const links = doc.getPages().flatMap(each => (each.node.Annots()?.asArray() ?? []).map(ref => String(doc.context.lookup(ref))));
  expect(links.some(link => link.includes(`${new URL(page.url()).origin}/projects/${projectId}/requirements/`))).toBe(true);
  expect(links.join(" ")).toContain(`${new URL(page.url()).origin}/projects/${projectId})`);

  // All active requirements, chosen on the page.
  await client.getByLabel("Requirements to include").selectOption("");
  const [all] = await Promise.all([client.waitForEvent("download"), client.getByRole("button", { name: "Download PDF" }).click()]);
  expect(all.suggestedFilename()).toMatch(/^checkout-all-\d{4}-\d{2}-\d{2}\.pdf$/);
  await context.close();
});

test("an export of another team's project, or with no session, is not given out", async ({ page, browser }) => {
  const projectId = await createProject(page);
  const outsider = await createTestSession("Outsider");
  await createTestTeam(outsider.userId, "Other team");
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  await context.addCookies([outsider.cookie]);
  const response = await context.request.get(`/projects/${projectId}/exports/pdf`);
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).not.toContain("pdf");
  await context.close();
  const anonymous = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const signedOut = await anonymous.request.get(`/projects/${projectId}/exports/pdf`, { maxRedirects: 0 });
  expect(signedOut.headers()["content-type"] ?? "").not.toContain("pdf");
  await anonymous.close();
});
