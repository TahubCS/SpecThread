"use client";

import { useActionState, useState } from "react";
import { archiveRequirement } from "@/app/projects/requirement-actions";

/** Renders the archive action for a requirement, which asks for confirmation first. */
export function RequirementArchive({ projectId, requirementId }: { projectId: string; requirementId: string }) {
  const [state, action, pending] = useActionState(archiveRequirement.bind(null, projectId, requirementId), { error: null });
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="settings-block is-danger" aria-labelledby="archive-requirement-heading">
      <h2 id="archive-requirement-heading">Archive requirement</h2>
      <p>An archived requirement can still be opened by its address, but it leaves the list and can no longer be changed. Archiving cannot be undone.</p>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
      {confirming ? (
        <form className="form-actions" action={action} aria-label="Confirm archive">
          <button className="button danger" type="submit" disabled={pending}>{pending ? "Archiving..." : "Yes, archive this requirement"}</button>
          <button className="button secondary" type="button" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
        </form>
      ) : (
        <button className="button secondary" type="button" onClick={() => setConfirming(true)}>Archive requirement</button>
      )}
    </section>
  );
}
