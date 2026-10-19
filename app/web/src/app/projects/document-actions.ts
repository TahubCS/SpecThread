"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { DOCUMENT_TITLE_MAX, documentFileError, parseDocument } from "@/lib/documents";
import { fieldError, isUuid } from "@/lib/projects";

export type DocumentFormState = { errors: { file?: string; title?: string; form?: string } | null };
export type DocumentArchiveState = { error: string | null };

const PROJECT_ARCHIVED = "This project is archived, so its documents can't be changed.";

/**
 * Uploads the form's file and optional title to a project, then opens the new document.
 * Only those two fields are forwarded; the API checks the file's contents (ADR-047).
 */
export async function uploadDocument(projectId: string, _previous: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  const failed = "The document could not be uploaded. Please try again.";
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim();
  const fileError = file instanceof File ? documentFileError(file.name, file.size) : "Choose a file to upload.";
  const titleError = title.length > DOCUMENT_TITLE_MAX ? `Use ${DOCUMENT_TITLE_MAX} characters or fewer.` : null;
  if (fileError || titleError) return { errors: { file: fileError ?? undefined, title: titleError ?? undefined } };
  if (!isUuid(projectId) || !(file instanceof File)) return { errors: { form: failed } };

  const body = new FormData();
  body.set("file", file, file.name);
  if (title) body.set("title", title);
  let documentId: string;
  try {
    const response = await apiFetch(`/projects/${projectId}/documents`, { method: "POST", body });
    if (response.status === 400) {
      const problem: unknown = await response.json();
      const errors = { file: fieldError(problem, "file") ?? undefined, title: fieldError(problem, "title") ?? undefined };
      return { errors: errors.file || errors.title ? errors : { form: failed } };
    }
    if (response.status === 413) return { errors: { file: documentFileError("", Number.MAX_SAFE_INTEGER) ?? failed } };
    if (response.status === 409) return { errors: { form: PROJECT_ARCHIVED } };
    if (!response.ok) throw new Error(`Upload document returned ${response.status}.`);
    documentId = parseDocument(await response.json()).id;
  } catch (error) {
    console.error("Upload document failed", error);
    return { errors: { form: failed } };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/documents/${documentId}`);
}

/** Archives a document, then returns to the project's document list. Archiving cannot be undone. */
export async function archiveDocument(projectId: string, documentId: string): Promise<DocumentArchiveState> {
  const failed = "The document could not be archived. Please try again.";
  if (!isUuid(projectId) || !isUuid(documentId)) return { error: failed };
  try {
    const response = await apiFetch(`/documents/${documentId}/archive`, { method: "POST" });
    if (response.status === 409) return { error: PROJECT_ARCHIVED };
    if (!response.ok) throw new Error(`Archive document returned ${response.status}.`);
  } catch (error) {
    console.error("Archive document failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/documents`);
}
