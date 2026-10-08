"use client";

import { startTransition, useActionState, useState } from "react";
import { recordReview, type ReviewFormState } from "@/app/projects/review-actions";
import { formatDate } from "@/lib/projects";
import { DECISIONS, decisionText, REVIEW_NOTE_MAX, reviewedText, reviewOutdated, type Review } from "@/lib/reviews";

const choiceText = { accepted: "Accept", rejected: "Reject", more_evidence: "Request more evidence" } as const;

/**
 * Renders the decisions recorded on a requirement: the current one with who made it, their note,
 * and what they reviewed; a notice when the requirement or its evidence has changed since; and
 * earlier decisions on demand. `canReview` is "yes" for a member who may decide, "author" for the
 * person who wrote the requirement, and "read-only" when nothing can change.
 */
export function ReviewPanel({ projectId, requirementId, version, reviews, evidenceIds, people, canReview }: {
  projectId: string;
  requirementId: string;
  version: number;
  reviews: Review[];
  evidenceIds: string[];
  /** Names of the project's members by user ID. */
  people: Record<string, string>;
  canReview: "yes" | "author" | "read-only";
}) {
  const [state, action, pending] = useActionState(recordReview.bind(null, projectId, requirementId, version), { errors: null, recorded: 0 });
  const [current, ...earlier] = reviews;
  const outdated = current ? reviewOutdated(current, version, evidenceIds) : null;

  return (
    <>
      {current ? (
        <div className="side-card review-current">
          <Decision review={current} people={people} />
          <details className="evidence-commits">
            <summary>{reviewedText(current)}</summary>
            {current.evidence.length > 0 && (
              <ul aria-label="Evidence reviewed">
                {current.evidence.map(link => (
                  <li key={link.id}>
                    <span className="evidence-number">{link.label}</span>
                    <span className="check-name">{link.title}</span>
                    {link.state && <span className="row-meta">{link.state}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted">This is what was linked when the decision was made.</p>
          </details>
        </div>
      ) : (
        <p className="muted">No decision has been recorded yet.</p>
      )}
      {outdated && (outdated.version || outdated.evidence) && (
        <p className="notice" role="status">
          {outdated.version && "This decision was made on an earlier version of the requirement. "}
          {outdated.evidence && "The evidence has changed since this decision. "}
          It needs a new review.
        </p>
      )}
      {earlier.length > 0 && (
        <details className="review-history">
          <summary>{earlier.length === 1 ? "1 earlier decision" : `${earlier.length} earlier decisions`}</summary>
          <ol aria-label="Earlier decisions">
            {earlier.map(review => <li key={review.id}><Decision review={review} people={people} /><p className="muted">{reviewedText(review)}</p></li>)}
          </ol>
        </details>
      )}
      {canReview === "author" && <p className="notice">You created this requirement, so another member has to review it.</p>}
      {canReview === "yes" && <ReviewForm key={state.recorded} action={action} pending={pending} state={state} />}
    </>
  );
}

/** Renders one decision: what was decided, by whom, when, and their note. */
function Decision({ review, people }: { review: Review; people: Record<string, string> }) {
  return (
    <>
      <p className="review-decision">
        <span className={`badge review-badge is-${review.decision}`}><span aria-hidden="true" />{decisionText[review.decision]}</span>
        <span className="muted">
          by {people[review.decidedBy] ?? "a former member"} on <time dateTime={review.decidedAt}>{formatDate(review.decidedAt)}</time>
        </span>
      </p>
      {review.note && <p className="review-note">{review.note}</p>}
    </>
  );
}

/** Renders the form for a new decision. Remounted after each recorded decision, which clears it. */
function ReviewForm({ action, pending, state }: { action: (formData: FormData) => void; pending: boolean; state: ReviewFormState }) {
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const errors = state.errors;
  return (
    // Submitted by hand: a form action would reset the form, and with it the chosen decision, after a refused attempt.
    <form className="review-form" aria-label="Record a decision" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => action(data));
    }}>
      {errors?.form && <p role="alert" className="notice notice-error">{errors.form}</p>}
      <fieldset aria-describedby={errors?.decision ? "review-decision-error" : undefined}>
        <legend>Your decision</legend>
        <div className="review-choices">
          {DECISIONS.map(value => (
            <label key={value}>
              <input type="radio" name="decision" value={value} required checked={decision === value} onChange={() => setDecision(value)} />
              {choiceText[value]}
            </label>
          ))}
        </div>
        {errors?.decision && <p id="review-decision-error" role="alert" className="notice notice-error">{errors.decision}</p>}
      </fieldset>
      <div className="field">
        <label htmlFor="review-note">Note{decision && decision !== "accepted" ? "" : " (optional)"}</label>
        <textarea id="review-note" name="note" rows={3} maxLength={REVIEW_NOTE_MAX} value={note} onChange={event => setNote(event.target.value)}
          aria-invalid={errors?.note ? true : undefined} aria-describedby={errors?.note ? "review-note-error" : undefined} />
        {errors?.note && <p id="review-note-error" role="alert" className="notice notice-error">{errors.note}</p>}
      </div>
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Recording..." : "Record decision"}</button>
      </div>
    </form>
  );
}
