"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { recordRelease, refreshRelease, type ReleaseFormState } from "@/app/projects/release-actions";
import { RELEASE_ENVIRONMENT_MAX, RELEASE_TAG_MAX, SUGGESTED_ENVIRONMENTS } from "@/lib/releases";

/**
 * The form for recording that a published release reached an environment on a date (ADR-066).
 * `today` is the default date and `latest` the last one the API accepts (the next UTC day), as
 * YYYY-MM-DD; any earlier date can be chosen.
 */
export function RecordReleaseForm({ projectId, repository, today, latest }: { projectId: string; repository: string; today: string; latest: string }) {
  const initial: ReleaseFormState = { values: { tag: "", environment: "Production", deployedOn: today }, errors: {}, error: null };
  const [state, action, pending] = useActionState(recordRelease.bind(null, projectId), initial);
  const describe = (field: keyof ReleaseFormState["errors"]) => state.errors[field] ? `release-${field}-error` : undefined;
  return (
    <form className="release-form" action={action} aria-label="Record a release">
      <div className="field">
        <label htmlFor="release-tag">Release tag in {repository}</label>
        <input id="release-tag" name="tag" type="text" autoComplete="off" required maxLength={RELEASE_TAG_MAX} placeholder="For example, v1.2.0"
          defaultValue={state.values.tag} aria-invalid={state.errors.tag ? true : undefined} aria-describedby={describe("tag")} />
        {state.errors.tag && <p id="release-tag-error" role="alert" className="notice notice-error">{state.errors.tag}</p>}
      </div>
      <div className="release-form-row">
        <div className="field">
          <label htmlFor="release-environment">Environment</label>
          <input id="release-environment" name="environment" type="text" autoComplete="off" required maxLength={RELEASE_ENVIRONMENT_MAX}
            list="release-environments" defaultValue={state.values.environment}
            aria-invalid={state.errors.environment ? true : undefined} aria-describedby={describe("environment")} />
          <datalist id="release-environments">
            {SUGGESTED_ENVIRONMENTS.map(environment => <option key={environment} value={environment} />)}
          </datalist>
          {state.errors.environment && <p id="release-environment-error" role="alert" className="notice notice-error">{state.errors.environment}</p>}
        </div>
        <div className="field">
          <label htmlFor="release-deployed-on">Deployed on</label>
          <input id="release-deployed-on" name="deployedOn" type="date" required max={latest} defaultValue={state.values.deployedOn}
            aria-invalid={state.errors.deployedOn ? true : undefined} aria-describedby={describe("deployedOn")} />
          {state.errors.deployedOn && <p id="release-deployedOn-error" role="alert" className="notice notice-error">{state.errors.deployedOn}</p>}
        </div>
      </div>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Recording..." : "Record release"}</button>
      </div>
    </form>
  );
}

/** Compares a recorded release again with every change linked in the project now. */
export function RefreshReleaseButton({ projectId, releaseId }: { projectId: string; releaseId: string }) {
  const [state, action, pending] = useActionState(refreshRelease.bind(null, projectId, releaseId), { error: null });
  return (
    <>
      <form className="evidence-refresh" action={action}>
        <span className="muted">Changes linked since the last comparison are included once it is compared again.</span>
        <button className="button secondary" type="submit" disabled={pending}>
          <RefreshCw size={14} aria-hidden="true" /> {pending ? "Comparing..." : "Compare again"}
        </button>
      </form>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
    </>
  );
}
