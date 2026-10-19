/** A project reference document's metadata as the API returns it (docs/API.md, ADR-047). */
export type ProjectDocument = {
  id: string;
  projectId: string;
  title: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  archivedAt: string | null;
};

/** Matches the API limit, which keeps uploads and downloads under Vercel's 4.5 MB function body limit. */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_TITLE_MAX = 200;

const formats = {
  ".pdf": { label: "PDF", contentType: "application/pdf" },
  ".doc": { label: "DOC", contentType: "application/msword" },
  ".docx": { label: "DOCX", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
} as const;

/** The file input's accept list: extensions plus MIME types, so pickers filter on any platform. */
export const DOCUMENT_ACCEPT = Object.entries(formats).flatMap(([extension, { contentType }]) => [extension, contentType]).join(",");

/**
 * Returns a message when a chosen file can't be uploaded, otherwise null. This is a quick
 * check for the form; the API also verifies the file's contents and remains the authority.
 */
export function documentFileError(name: string, size: number): string | null {
  if (size <= 0) return "Choose a file to upload.";
  if (size > MAX_DOCUMENT_BYTES) return `Use a file of at most ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`;
  if (!(extensionOf(name) in formats)) return "Upload a PDF, DOC, or DOCX file.";
  return null;
}

/** Returns the short label for a document's content type, such as "PDF", or "File" when unknown. */
export function documentTypeLabel(contentType: string) {
  return Object.values(formats).find(format => format.contentType === contentType)?.label ?? "File";
}

/** Formats a byte count as B, KB, or MB with one decimal place above 1 KB. */
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/** Validates one document from an API response. Throws when the shape is not the documented one. */
export function parseDocument(value: unknown): ProjectDocument {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.projectId !== "string" ||
      typeof item.title !== "string" || typeof item.fileName !== "string" || typeof item.contentType !== "string" ||
      typeof item.sizeBytes !== "number" || !Number.isInteger(item.sizeBytes) || item.sizeBytes < 1 ||
      typeof item.uploadedBy !== "string" || typeof item.uploadedByName !== "string" || !isDate(item.uploadedAt) ||
      (item.archivedAt !== null && !isDate(item.archivedAt))) {
    throw new Error("The API returned an unexpected document.");
  }
  return {
    id: item.id, projectId: item.projectId, title: item.title, fileName: item.fileName, contentType: item.contentType,
    sizeBytes: item.sizeBytes, uploadedBy: item.uploadedBy, uploadedByName: item.uploadedByName,
    uploadedAt: item.uploadedAt, archivedAt: item.archivedAt,
  };
}

/** Validates a document list from an API response. Throws when it is not an array of documents. */
export function parseDocuments(value: unknown): ProjectDocument[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected document list.");
  return value.map(parseDocument);
}

/** Returns the lowercase extension including the dot, or "" when the name has none. */
function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}
