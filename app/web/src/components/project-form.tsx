"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createProject } from "@/app/projects/actions";
import { PROJECT_NAME_MAX } from "@/lib/projects";

/** Renders the create-project form and shows the server's message next to the name field. */
export function ProjectForm() {
  const [state, action, pending] = useActionState(createProject, { name: "", error: null });

  return (
    <form className="project-form" action={action} aria-label="Create a project">
      <div className="field">
        <label htmlFor="project-name">Project name</label>
        <input id="project-name" name="name" type="text" autoComplete="off" required maxLength={PROJECT_NAME_MAX}
          defaultValue={state.name} aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "project-name-error" : undefined} />
        {state.error && <p id="project-name-error" role="alert" className="notice notice-error">{state.error}</p>}
      </div>
      <div className="project-form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Creating..." : "Create project"}</button>
        <Link className="button secondary" href="/projects">Cancel</Link>
      </div>
    </form>
  );
}
