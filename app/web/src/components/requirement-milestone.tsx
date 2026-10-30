"use client";

import { useActionState, useState } from "react";
import { setMilestone } from "@/app/projects/requirement-actions";
import { MILESTONE_MAX } from "@/lib/requirements";

/**
 * Renders a requirement's milestone or sprint label (ADR-053) with a field to set or clear it
 * while the requirement is editable. The field suggests the labels already used in the project.
 * Setting it is not an edit, so the version and any decision stay as they are.
 */
export function RequirementMilestone({ projectId, requirementId, milestone, milestones, editable }: {
  projectId: string;
  requirementId: string;
  milestone: string | null;
  milestones: string[];
  editable: boolean;
}) {
  const [state, action, pending] = useActionState(setMilestone.bind(null, projectId, requirementId), { error: null, saved: 0 });
  const [value, setValue] = useState(milestone ?? "");

  if (!editable) return <p className={milestone ? undefined : "muted"}>{milestone ?? "No milestone."}</p>;
  return (
    <form className="evidence-link" action={action} aria-label="Milestone">
      <div className="field">
        <label htmlFor="requirement-milestone">Milestone or sprint</label>
        <div className="evidence-link-row">
          <input id="requirement-milestone" name="milestone" type="text" autoComplete="off" maxLength={MILESTONE_MAX}
            list="requirement-milestone-options" placeholder="For example, Sprint 3" value={value} onChange={event => setValue(event.target.value)}
            aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "requirement-milestone-error" : undefined} />
          <datalist id="requirement-milestone-options">
            {milestones.map(label => <option key={label} value={label} />)}
          </datalist>
          <button className="button secondary" type="submit" name="intent" value="save" disabled={pending}>{pending ? "Saving..." : "Save"}</button>
          {milestone && (
            <button className="button secondary" type="submit" name="intent" value="clear" disabled={pending} onClick={() => setValue("")}>Clear</button>
          )}
        </div>
        {state.error && <p id="requirement-milestone-error" role="alert" className="notice notice-error">{state.error}</p>}
        {state.saved > 0 && !state.error && <p className="muted" role="status">Milestone saved.</p>}
      </div>
    </form>
  );
}
