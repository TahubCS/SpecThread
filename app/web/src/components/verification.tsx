"use client";

import { useActionState } from "react";
import { Play, RefreshCw } from "lucide-react";
import {
  refreshVerificationRuns, removeVerificationSettings, saveVerificationSettings, startVerificationRun, type VerificationSettingsState,
} from "@/app/projects/verification-actions";
import { formatDateTime } from "@/lib/projects";
import { hasUnfinishedRun, verificationRunText, type VerificationRun } from "@/lib/verification";

const external = { target: "_blank", rel: "noreferrer" } as const;

/** The form an Owner or Admin uses to name the predefined verification workflow and its branch (ADR-070). */
export function VerificationSettingsForm({ projectId, repository, workflow, branch }: {
  projectId: string; repository: string; workflow: string; branch: string;
}) {
  const initial: VerificationSettingsState = { values: { workflow, branch }, errors: {}, error: null, saved: false };
  const [state, action, pending] = useActionState(saveVerificationSettings.bind(null, projectId), initial);
  return (
    <form className="release-form" action={action} aria-label="Verification workflow">
      <div className="field">
        <label htmlFor="verification-workflow">Workflow file in {repository}/.github/workflows</label>
        <input id="verification-workflow" name="workflow" type="text" autoComplete="off" required maxLength={105}
          placeholder="specthread-verification.yml" defaultValue={state.values.workflow}
          aria-invalid={state.errors.workflow ? true : undefined} aria-describedby={state.errors.workflow ? "verification-workflow-error" : undefined} />
        {state.errors.workflow && <p id="verification-workflow-error" role="alert" className="notice notice-error">{state.errors.workflow}</p>}
      </div>
      <div className="field">
        <label htmlFor="verification-branch">Branch it runs on</label>
        <input id="verification-branch" name="branch" type="text" autoComplete="off" required maxLength={255} defaultValue={state.values.branch}
          aria-invalid={state.errors.branch ? true : undefined} aria-describedby={state.errors.branch ? "verification-branch-error" : undefined} />
        {state.errors.branch && <p id="verification-branch-error" role="alert" className="notice notice-error">{state.errors.branch}</p>}
      </div>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
      {state.saved && <p role="status" className="notice">Verification saved. Members can now run it from each requirement.</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Checking GitHub..." : "Save verification"}</button>
      </div>
    </form>
  );
}

/** Removes the predefined verification; runs already recorded stay on their requirements. */
export function RemoveVerification({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(removeVerificationSettings.bind(null, projectId), { error: null });
  return (
    <form className="form-actions" action={action} aria-label="Remove verification">
      <button className="button secondary" type="submit" disabled={pending}>{pending ? "Removing..." : "Remove verification"}</button>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
    </form>
  );
}

/**
 * A requirement's runs of the predefined verification, newest first (ADR-070): each with its
 * outcome in the product's words, who started it and when, when it finished, and a link to its log
 * on GitHub. Members who can edit start a run or read unfinished ones from GitHub again.
 */
export function VerificationPanel({ projectId, requirementId, runs, people, canRun, workflow }: {
  projectId: string; requirementId: string; runs: VerificationRun[]; people: Record<string, string>; canRun: boolean; workflow: string;
}) {
  const [started, startAction, starting] = useActionState(startVerificationRun.bind(null, projectId, requirementId), { error: null });
  const [refreshed, refreshAction, refreshing] = useActionState(refreshVerificationRuns.bind(null, projectId, requirementId), { error: null });
  const unfinished = hasUnfinishedRun(runs);
  return (
    <>
      {runs.length === 0 ? (
        <p className="muted">The predefined verification ({workflow}) hasn&apos;t been run for this requirement.</p>
      ) : (
        <ul className="row-list verification-runs" aria-label="Verification runs">
          {runs.map(run => (
            <li key={run.id}>
              <div className="row">
                <span className={`check-result is-wide is-${run.status === "completed" ? run.result : "running"}`}>
                  <span aria-hidden="true" />{verificationRunText(run)}
                </span>
                <span className="row-title">{run.workflow} on {run.branch}</span>
                {run.url && <a className="row-meta" href={run.url} {...external}>Run log<span className="sr-only"> on GitHub (opens in a new tab)</span></a>}
              </div>
              <p className="evidence-changes">
                Started by {people[run.requestedBy] ?? "a former member"} on <time dateTime={run.requestedAt}>{formatDateTime(run.requestedAt)}</time>
                {run.completedAt && <> · finished <time dateTime={run.completedAt}>{formatDateTime(run.completedAt)}</time></>}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canRun && (
        <div className="verification-actions">
          <form action={startAction}>
            <button className="button secondary" type="submit" disabled={starting || unfinished}>
              <Play size={14} aria-hidden="true" /> {starting ? "Starting..." : "Run verification"}
            </button>
          </form>
          {unfinished && (
            <form action={refreshAction}>
              <button className="button secondary" type="submit" disabled={refreshing}>
                <RefreshCw size={14} aria-hidden="true" /> {refreshing ? "Reading GitHub..." : "Refresh from GitHub"}
              </button>
            </form>
          )}
        </div>
      )}
      {started.error && <p role="alert" className="notice notice-error">{started.error}</p>}
      {refreshed.error && <p role="alert" className="notice notice-error">{refreshed.error}</p>}
    </>
  );
}
