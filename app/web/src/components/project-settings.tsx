"use client";

import { useActionState, useState } from "react";
import { archiveProject, renameProject } from "@/app/projects/actions";
import { PROJECT_NAME_MAX } from "@/lib/projects";

/** Renders a manager's rename form and the archive action, which asks for confirmation first. */
export function ProjectSettings({ projectId, name }: { projectId: string; name: string }) {
  const [rename, renameAction, renaming] = useActionState(renameProject.bind(null, projectId), { name, error: null, saved: false });
  const [archive, archiveAction, archiving] = useActionState(archiveProject.bind(null, projectId), { error: null });
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <form className="settings-block" action={renameAction} aria-label="Rename project">
        <div className="field">
          <label htmlFor="project-name">Project name</label>
          <input id="project-name" name="name" type="text" autoComplete="off" required maxLength={PROJECT_NAME_MAX}
            defaultValue={rename.name} aria-invalid={rename.error ? true : undefined}
            aria-describedby={rename.error ? "project-name-error" : undefined} />
          {rename.error && <p id="project-name-error" role="alert" className="notice notice-error">{rename.error}</p>}
        </div>
        <div className="form-actions">
          <button className="button" type="submit" disabled={renaming}>{renaming ? "Saving..." : "Save name"}</button>
          {rename.saved && !renaming && <span role="status" className="muted">Saved</span>}
        </div>
      </form>
      <section className="settings-block is-danger" aria-labelledby="archive-heading">
        <h2 id="archive-heading">Archive project</h2>
        <p>An archived project can still be read, but nothing in it can be changed and it leaves your project list. Archiving cannot be undone.</p>
        {archive.error && <p role="alert" className="notice notice-error">{archive.error}</p>}
        {confirming ? (
          <form className="form-actions" action={archiveAction} aria-label="Confirm archive">
            <button className="button danger" type="submit" disabled={archiving}>{archiving ? "Archiving..." : "Yes, archive this project"}</button>
            <button className="button secondary" type="button" disabled={archiving} onClick={() => setConfirming(false)}>Cancel</button>
          </form>
        ) : (
          <button className="button secondary" type="button" onClick={() => setConfirming(true)}>Archive project</button>
        )}
      </section>
    </>
  );
}
