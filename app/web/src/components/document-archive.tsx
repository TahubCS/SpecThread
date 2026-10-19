"use client";

import { useActionState, useState } from "react";
import { archiveDocument } from "@/app/projects/document-actions";

/** Renders the archive action for a document, which asks for confirmation first. */
export function DocumentArchive({ projectId, documentId }: { projectId: string; documentId: string }) {
  const [state, action, pending] = useActionState(archiveDocument.bind(null, projectId, documentId), { error: null });
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="settings-block is-danger" aria-labelledby="archive-document-heading">
      <h2 id="archive-document-heading">Archive document</h2>
      <p>An archived document leaves the list but can still be opened and downloaded by its address. Archiving cannot be undone.</p>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
      {confirming ? (
        <form className="form-actions" action={action} aria-label="Confirm archive">
          <button className="button danger" type="submit" disabled={pending}>{pending ? "Archiving..." : "Yes, archive this document"}</button>
          <button className="button secondary" type="button" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
        </form>
      ) : (
        <button className="button secondary" type="button" onClick={() => setConfirming(true)}>Archive document</button>
      )}
    </section>
  );
}
