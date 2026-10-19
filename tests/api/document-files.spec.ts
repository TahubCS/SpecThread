import { expect, test } from "@playwright/test";
import {
  DOCUMENT_ACCEPT, documentFileError, documentTypeLabel, formatFileSize, MAX_DOCUMENT_BYTES, parseDocument, parseDocuments,
} from "../../app/web/src/lib/documents";

// Browser-independent document helpers (ADR-047); upload behavior is covered in tests/schema/documents-api.spec.ts.
const document = {
  id: "d1", projectId: "p1", title: "Brief", fileName: "brief.pdf", contentType: "application/pdf", sizeBytes: 12,
  uploadedBy: "u1", uploadedByName: "Ada", uploadedAt: "2026-10-18T23:30:00Z", archivedAt: null,
};

test("the upload form accepts PDF, DOC, and DOCX files within the size limit", () => {
  for (const name of ["spec.pdf", "Notes.DOC", "plan.final.docx"]) expect(documentFileError(name, 10), name).toBeNull();
  expect(documentFileError("spec.pdf", MAX_DOCUMENT_BYTES)).toBeNull();
  expect(documentFileError("spec.pdf", MAX_DOCUMENT_BYTES + 1)).toBe("Use a file of at most 4 MB.");
  expect(documentFileError("spec.pdf", 0)).toBe("Choose a file to upload.");
  for (const name of ["notes.txt", "pdf", "archive.pdf.zip", "spec."]) {
    expect(documentFileError(name, 10), name).toBe("Upload a PDF, DOC, or DOCX file.");
  }
  expect(DOCUMENT_ACCEPT.split(",")).toEqual(expect.arrayContaining([".pdf", ".doc", ".docx", "application/pdf"]));
});

test("document metadata is formatted for display", () => {
  expect(formatFileSize(512)).toBe("512 B");
  expect(formatFileSize(1536)).toBe("1.5 KB");
  expect(formatFileSize(MAX_DOCUMENT_BYTES)).toBe("4.0 MB");
  expect(documentTypeLabel("application/pdf")).toBe("PDF");
  expect(documentTypeLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("DOCX");
  expect(documentTypeLabel("text/plain")).toBe("File");
});

test("API documents are validated before they are rendered", () => {
  expect(parseDocument({ ...document, extra: "ignored" })).toEqual(document);
  expect(parseDocuments([document, { ...document, id: "d2", archivedAt: "2026-10-19T00:00:00Z" }])).toHaveLength(2);
  for (const broken of [null, "x", { ...document, sizeBytes: 0 }, { ...document, sizeBytes: 1.5 }, { ...document, title: 3 },
    { ...document, uploadedAt: "yesterday" }, { ...document, archivedAt: undefined }]) {
    expect(() => parseDocument(broken)).toThrow("The API returned an unexpected document.");
  }
  expect(() => parseDocuments({})).toThrow("The API returned an unexpected document list.");
});
