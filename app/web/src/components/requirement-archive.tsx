"use client";

import { useActionState, useState } from "react";
import { archiveRequirement, restoreRequirement } from "@/app/projects/requirement-actions";

/** Renders the archive action for a requirement, which asks for confirmation first. */
export function RequirementArchive({ projectId, requirementId }: { projectId: string; requirementId: string }) {
  const [state, action, pending] = useActionState(archiveRequirement.bind(null, projectId, requirementId), { error: null });
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="settings-block is-danger" aria-labelledby="archive-requirement-heading">
      <h2 id="archive-requirement-heading">Archive requirement</h2>
      <p>An archived requirement leaves the list but can still be opened from Archived requirements. It can&apos;t be edited or reviewed until it is restored.</p>
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

/** Renders the restore action for an archived requirement, which makes it editable and reviewable again. */
export function RequirementRestore({ projectId, requirementId }: { projectId: string; requirementId: string }) {
  const [state, action, pending] = useActionState(restoreRequirement.bind(null, projectId, requirementId), { error: null });

  return (
    <section className="settings-block" aria-labelledby="restore-requirement-heading">
      <h2 id="restore-requirement-heading">Restore requirement</h2>
      <p>Restoring returns it to the requirements list, where it can be edited and reviewed again. Its version and reviews stay as they are.</p>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
      <form className="form-actions" action={action} aria-label="Restore requirement">
        <button className="button secondary" type="submit" disabled={pending}>{pending ? "Restoring..." : "Restore requirement"}</button>
      </form>
    </section>
  );
}
