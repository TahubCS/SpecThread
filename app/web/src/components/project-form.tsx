"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createProject } from "@/app/projects/actions";
import { PROJECT_NAME_MAX } from "@/lib/projects";

/**
 * Renders the create-project form: a name and the team the project will belong to. `teams` are
 * the teams the user may create projects in. Each message appears next to its field.
 */
export function ProjectForm({ teams, initialTeamId }: { teams: { id: string; name: string }[]; initialTeamId: string }) {
  const [state, action, pending] = useActionState(createProject, { name: "", teamId: initialTeamId, error: null });

  return (
    <form className="settings-block" action={action} aria-label="Create a project">
      <div className="field">
        <label htmlFor="project-name">Project name</label>
        <input id="project-name" name="name" type="text" autoComplete="off" required maxLength={PROJECT_NAME_MAX}
          defaultValue={state.name} aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "project-name-error" : undefined} />
        {state.error && <p id="project-name-error" role="alert" className="notice notice-error">{state.error}</p>}
      </div>
      <div className="field">
        <label htmlFor="project-team">Team</label>
        {/* Keyed by the submitted value: the form resets after each attempt and must show the team that was chosen. */}
        <select id="project-team" name="teamId" required key={state.teamId} defaultValue={state.teamId}
          aria-invalid={state.teamError ? true : undefined} aria-describedby={state.teamError ? "project-team-error" : "project-team-help"}>
          {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        {state.teamError
          ? <p id="project-team-error" role="alert" className="notice notice-error">{state.teamError}</p>
          : <p id="project-team-help" className="field-help">Everyone in the team can open the project.</p>}
      </div>
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Creating..." : "Create project"}</button>
        <Link className="button secondary" href="/projects">Cancel</Link>
      </div>
    </form>
  );
}
