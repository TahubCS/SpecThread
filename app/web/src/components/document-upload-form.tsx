"use client";

import Link from "next/link";
import { useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import type { DocumentFormState } from "@/app/projects/document-actions";
import { DOCUMENT_ACCEPT, DOCUMENT_TITLE_MAX, documentFileError, MAX_DOCUMENT_BYTES } from "@/lib/documents";

type FormAction = (state: DocumentFormState, formData: FormData) => Promise<DocumentFormState>;

/**
 * Uploads one document. The chosen file is checked in the browser first so a wrong type or an
 * oversized file never leaves it; the server reports everything else next to the field.
 * The title is kept when the server rejects the form; the file must be chosen again.
 */
export function DocumentUploadForm({ action, cancelHref }: { action: FormAction; cancelHref: string }) {
  const [state, formAction, pending] = useActionState(action, { errors: null });
  const [localFileError, setLocalFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const fileError = localFileError ?? state.errors?.file;
  const titleError = state.errors?.title;

  /** Checks the newly chosen file, clearing the message when the selection is acceptable. */
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setLocalFileError(file ? documentFileError(file.name, file.size) : null);
  }

  /** Blocks submission while the chosen file is known to be unacceptable. */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const file = new FormData(event.currentTarget).get("file");
    const error = file instanceof File && file.name ? documentFileError(file.name, file.size) : "Choose a file to upload.";
    if (error) {
      event.preventDefault();
      setLocalFileError(error);
    }
  }

  return (
    <form className="document-form" action={formAction} onSubmit={handleSubmit} aria-label="Upload document" noValidate>
      {state.errors?.form && <p role="alert" className="notice notice-error">{state.errors.form}</p>}
      <div className="field">
        <label htmlFor="document-file">File</label>
        <input id="document-file" name="file" type="file" accept={DOCUMENT_ACCEPT} required onChange={handleFile}
          aria-invalid={fileError ? true : undefined}
          aria-describedby={fileError ? "document-file-help document-file-error" : "document-file-help"} />
        <p id="document-file-help" className="field-help">PDF, DOC, or DOCX, up to {MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.</p>
        {fileError && <p id="document-file-error" role="alert" className="notice notice-error">{fileError}</p>}
      </div>
      <div className="field">
        <label htmlFor="document-title">Title (optional)</label>
        <input id="document-title" name="title" type="text" autoComplete="off" maxLength={DOCUMENT_TITLE_MAX}
          value={title} onChange={event => setTitle(event.target.value)}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? "document-title-help document-title-error" : "document-title-help"} />
        <p id="document-title-help" className="field-help">Defaults to the file name.</p>
        {titleError && <p id="document-title-error" role="alert" className="notice notice-error">{titleError}</p>}
      </div>
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Uploading..." : "Upload document"}</button>
        <Link className="button secondary" href={cancelHref}>Cancel</Link>
      </div>
    </form>
  );
}
