import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createTestSession, createTestTeam, expect, runTestSql, test } from "./fixtures";
import { clearApiFaults, failApi } from "../support/api-faults";

// The project's Documentation tab (ADR-047): uploading, reading, downloading, and archiving
// documents, and how those pages behave when the API refuses or fails. Each test uses its own user.
let owner: Awaited<ReturnType<typeof createTestSession>>;
test.use({ signedIn: false });
test.beforeEach(async ({ context }) => {
  owner = await createTestSession("Document tester");
  await createTestTeam(owner.userId);
  await context.addCookies([owner.cookie]);
});
test.afterEach(() => clearApiFaults(owner.userId));

const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

async function createProject(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

/** Uploads a PDF through the form and returns the new document's ID from the page it opens. */
async function uploadPdf(page: Page, projectId: string, name: string, title = "") {
  await page.goto(`/projects/${projectId}/documents/new`);
  await page.getByLabel("File", { exact: true }).setInputFiles({ name, mimeType: "application/pdf", buffer: pdf });
  if (title) await page.getByLabel("Title (optional)").fill(title);
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  return page.url().split("/").at(-1)!;
}

test("a team member uploads, downloads, and archives a document from the Documentation tab", async ({ page }, testInfo) => {
  const projectId = await createProject(page, "Checkout");
  const tabs = page.getByRole("navigation", { name: "Project sections" });
  await tabs.getByRole("link", { name: "Documentation" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/documents$`));
  await expect(tabs.getByRole("link", { name: "Documentation" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("This project has no documents yet.")).toBeVisible();

  await page.getByRole("link", { name: "Upload document" }).click();
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "Product brief.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByLabel("Title (optional)").fill("Checkout product brief");
  await page.getByRole("button", { name: "Upload document" }).click();

  await expect(page.getByRole("heading", { name: "Checkout product brief", level: 1 })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Documentation" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Product brief.pdf")).toBeVisible();
  await expect(page.getByText(`${pdf.length} B`)).toBeVisible();
  await expect(page.getByText(/by Document tester$/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("document-page.png"), fullPage: true });

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("Product brief.pdf");
  expect(Buffer.compare(await readFile((await download.path())!), pdf)).toBe(0);

  await page.getByRole("link", { name: "Documentation" }).first().click();
  await expect(page.getByRole("list", { name: "Documents" }).getByRole("link")).toHaveText([/^Checkout product brief.*PDF/]);
  await page.screenshot({ path: testInfo.outputPath("documents-list.png"), fullPage: true });

  await page.getByRole("list", { name: "Documents" }).getByRole("link").click();
  await page.getByRole("button", { name: "Archive document" }).click();
  await page.getByRole("button", { name: "Yes, archive this document" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/documents$`));
  await expect(page.getByText("This project has no documents yet.")).toBeVisible();
});

test("the upload form rejects wrong files in the browser and shows the server's reasons", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  await page.goto(`/projects/${projectId}/documents/new`);
  const form = page.getByRole("form", { name: "Upload document" });
  const file = page.getByLabel("File", { exact: true });
  await expect(file).toHaveAttribute("accept", /\.pdf,.*\.docx/);

  await form.getByRole("button", { name: "Upload document" }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose a file to upload.");

  await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("plain text") });
  await expect(form.getByRole("alert")).toHaveText("Upload a PDF, DOC, or DOCX file.");
  await expect(file).toHaveAttribute("aria-invalid", "true");

  await file.setInputFiles({ name: "large.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
  await expect(form.getByRole("alert")).toHaveText("Use a file of at most 4 MB.");

  // Only the API reads the contents: a DOCX that isn't a ZIP passes the browser check.
  await file.setInputFiles({ name: "fake.docx", mimeType: "application/octet-stream", buffer: Buffer.from("not a zip file") });
  await expect(form.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Title (optional)").fill("Kept title");
  await form.getByRole("button", { name: "Upload document" }).click();
  await expect(form.getByRole("alert")).toHaveText("The file's contents don't match its type.");
  await expect(page.getByLabel("Title (optional)")).toHaveValue("Kept title");
  await expect(page).toHaveURL(/\/documents\/new$/);
});

test("a failed upload keeps the user on the form with a general message", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  await failApi(owner.userId, { method: "POST", path: "/documents$", status: 500 });
  await page.goto(`/projects/${projectId}/documents/new`);
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "brief.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("form", { name: "Upload document" }).getByRole("alert"))
    .toHaveText("The document could not be uploaded. Please try again.");
  await expect(page).toHaveURL(/\/documents\/new$/);
});

test("archived projects keep documents downloadable but take no new ones", async ({ page }) => {
  const projectId = await createProject(page, "Checkout");
  const documentId = await uploadPdf(page, projectId, "brief.pdf", "Brief");
  await runTestSql(`UPDATE public.projects SET archived_at = now() WHERE id = '${projectId}'`);

  await page.goto(`/projects/${projectId}/documents`);
  await expect(page.getByRole("list", { name: "Documents" }).getByRole("link")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Upload document" })).toHaveCount(0);
  await page.goto(`/projects/${projectId}/documents/new`);
  await expect(page.getByText("This project is archived, so documents can't be added.")).toBeVisible();

  await page.goto(`/projects/${projectId}/documents/${documentId}`);
  await expect(page.getByRole("button", { name: "Archive document" })).toHaveCount(0);
  const response = await page.request.get(`/projects/${projectId}/documents/${documentId}/download`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename=brief\.pdf/);
});

test("a document opened under another project's address is not found", async ({ page }) => {
  const first = await createProject(page, "Checkout");
  const documentId = await uploadPdf(page, first, "brief.pdf");
  const second = await createProject(page, "Billing");

  await page.goto(`/projects/${second}/documents/${documentId}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await page.request.get(`/projects/${second}/documents/${documentId}/download`)).status()).toBe(404);
  expect((await page.request.get(`/projects/${second}/documents/not-an-id/download`)).status()).toBe(404);
});
