"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { RequirementFormState } from "@/app/projects/requirement-actions";
import { documentTypeLabel } from "@/lib/documents";
import { formatDate } from "@/lib/projects";
import {
  CRITERIA_MAX, CRITERION_MAX, criteriaChanged, MILESTONE_MAX, moveItem, REQUIREMENT_DESCRIPTION_MAX, REQUIREMENT_TITLE_MAX,
  type DocumentChoice, type RequirementInput,
} from "@/lib/requirements";

type FormAction = (state: RequirementFormState, formData: FormData) => Promise<RequirementFormState>;

/** The decision that accepted a requirement's current criteria, with the reviewer's name. */
export type AcceptedCriteria = { criteriaVersion: number; decidedBy: string; decidedAt: string };

/**
 * Renders the form for a requirement's title, description, ordered acceptance criteria, and
 * linked project documents. Criteria can be moved up and down; the order on screen is the order
 * saved. A requirement needs at least one criterion, so a form without any starts with an empty
 * one. Fields keep what the user typed when the server rejects the form, and each message
 * appears next to the field it is about, also after its criterion has been moved.
 *
 * When `accepted` is set, the latest decision accepted the current criteria, so changing them
 * asks for confirmation before anything is sent: that acceptance applies to the previous
 * criteria, and the requirement will need a new review (ADR-051). The API asks the same when
 * someone accepted it after this form was loaded. `milestones` shows the optional milestone
 * field, suggesting the labels already in use; only the create form has it (ADR-053).
 */
export function RequirementForm({ action, initial, documents, documentsHref, submitLabel, pendingLabel, cancelHref, label, accepted = null, milestones }: {
  action: FormAction;
  initial: RequirementInput;
  documents: DocumentChoice[];
  documentsHref: string;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
  label: string;
  accepted?: AcceptedCriteria | null;
  milestones?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, { errors: null });
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [milestone, setMilestone] = useState(initial.milestone ?? "");
  const [warning, setWarning] = useState(false);
  const [answered, setAnswered] = useState(state);
  const warningRef = useRef<HTMLDivElement>(null);
  // A refusal because the criteria were accepted meanwhile opens the warning too.
  if (state !== answered) {
    setAnswered(state);
    if (state.needsConfirmation) setWarning(true);
  }
  useEffect(() => {
    if (warning) warningRef.current?.focus();
  }, [warning]);
  const [rows, setRows] = useState(() => (initial.criteria.length ? initial.criteria : [""]).map((text, key) => ({ key, text })));
  const nextKey = useRef(Math.max(initial.criteria.length, 1));
  // The form resets after a server-side rejection. Text fields keep their value because React
  // keeps their default in step; checkboxes don't, so their default follows this state instead.
  const [linked, setLinked] = useState(() => new Set(initial.documentIds));
  // Row keys in the order last sent. Messages about a criterion name its position in that order.
  const [sent, setSent] = useState<number[]>([]);
  const [moved, setMoved] = useState("");
  const errors = state.errors;
  // Compared as the API compares them, ignoring rows left empty, which are refused anyway.
  const changed = criteriaChanged(initial.criteria, rows.map(row => row.text).filter(text => text.trim()));
  // Criteria put back as they were accepted leave nothing to warn about, and no new version to announce.
  if (warning && !changed) setWarning(false);
  const move =(index: number, to: number) => {
    if (to < 0 || to >= rows.length) return;
    setRows(current => moveItem(current, index, to));
    setMoved(`Criterion moved to position ${to + 1} of ${rows.length}.`);
  };

  return (
    <form className="requirement-form" action={formAction} aria-label={label} onSubmit={event => {
      const confirmed = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("name") === "confirmCriteriaChange";
      if (!confirmed && accepted && changed) {
        event.preventDefault();
        setWarning(true);
        return;
      }
      setSent(rows.map(row => row.key));
    }} onKeyDown={event => {
      // While the warning is open its confirm button is the form's only submit button, so Enter
      // in a field would confirm. Only an explicit press of that button confirms.
      if (warning && event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
    }}>
      {errors?.form && <p role="alert" className="notice notice-error">{errors.form}</p>}
      <div className="field">
        <label htmlFor="requirement-title">Title</label>
        <input id="requirement-title" name="title" type="text" autoComplete="off" required maxLength={REQUIREMENT_TITLE_MAX}
          value={title} onChange={event => setTitle(event.target.value)}
          aria-invalid={errors?.title ? true : undefined} aria-describedby={errors?.title ? "requirement-title-error" : undefined} />
        {errors?.title && <p id="requirement-title-error" role="alert" className="notice notice-error">{errors.title}</p>}
      </div>
      <div className="field">
        <label htmlFor="requirement-description">Description</label>
        <textarea id="requirement-description" name="description" rows={6} maxLength={REQUIREMENT_DESCRIPTION_MAX}
          value={description} onChange={event => setDescription(event.target.value)}
          aria-invalid={errors?.description ? true : undefined}
          aria-describedby={errors?.description ? "requirement-description-error" : undefined} />
        {errors?.description && <p id="requirement-description-error" role="alert" className="notice notice-error">{errors.description}</p>}
      </div>
      <fieldset className="criteria-fieldset">
        <legend>Acceptance criteria</legend>
        <p className="muted">List what a reviewer can check, in the order they should read it.</p>
        {errors?.criteria && <p role="alert" className="notice notice-error">{errors.criteria}</p>}
        {rows.length > 0 && (
          <ol className="criteria-inputs">
            {rows.map((row, index) => {
              const error = errors?.items[sent.indexOf(row.key)];
              return (
              <li key={row.key}>
                <span className="criteria-number" aria-hidden="true">{index + 1}</span>
                <div className="field">
                  <input name="criteria" type="text" autoComplete="off" maxLength={CRITERION_MAX} aria-label={`Criterion ${index + 1}`}
                    value={row.text} onChange={event => setRows(current => current.map(item => item.key === row.key ? { ...item, text: event.target.value } : item))}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `criterion-${row.key}-error` : undefined} />
                  {error && <p id={`criterion-${row.key}-error`} role="alert" className="notice notice-error">{error}</p>}
                </div>
                {/* aria-disabled, not disabled: a row that reaches the top or bottom keeps keyboard focus on its button. */}
                <button type="button" className="icon-button" aria-label={`Move criterion ${index + 1} up`}
                  aria-disabled={index === 0 ? true : undefined} onClick={() => move(index, index - 1)}>
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button type="button" className="icon-button" aria-label={`Move criterion ${index + 1} down`}
                  aria-disabled={index === rows.length - 1 ? true : undefined} onClick={() => move(index, index + 1)}>
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button type="button" className="icon-button" aria-label={`Remove criterion ${index + 1}`}
                  onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
              );
            })}
          </ol>
        )}
        <p className="criteria-moved" role="status">{moved}</p>
        <button type="button" className="button secondary" disabled={rows.length >= CRITERIA_MAX}
          onClick={() => setRows(current => [...current, { key: nextKey.current++, text: "" }])}>
          <Plus size={15} aria-hidden="true" /> Add criterion
        </button>
      </fieldset>
      {milestones && (
        <div className="field">
          <label htmlFor="requirement-milestone">Milestone or sprint (optional)</label>
          <input id="requirement-milestone" name="milestone" type="text" autoComplete="off" maxLength={MILESTONE_MAX}
            list="requirement-milestone-options" value={milestone} onChange={event => setMilestone(event.target.value)}
            aria-invalid={errors?.milestone ? true : undefined} aria-describedby={errors?.milestone ? "requirement-milestone-error" : undefined} />
          <datalist id="requirement-milestone-options">
            {milestones.map(label => <option key={label} value={label} />)}
          </datalist>
          {errors?.milestone && <p id="requirement-milestone-error" role="alert" className="notice notice-error">{errors.milestone}</p>}
        </div>
      )}
      <fieldset className="criteria-fieldset" aria-describedby={errors?.documents ? "requirement-documents-error" : undefined}>
        <legend>Reference documents</legend>
        <p className="muted">Link the documents this requirement comes from or relies on.</p>
        {errors?.documents && <p id="requirement-documents-error" role="alert" className="notice notice-error">{errors.documents}</p>}
        {documents.length === 0
          ? <p className="muted">This project has no documents yet. <Link href={documentsHref}>Upload one in Documentation</Link>.</p>
          : (
            <ul className="document-choices">
              {documents.map(document => (
                <li key={document.id}>
                  <label>
                    <input type="checkbox" name="documents" value={document.id} defaultChecked={linked.has(document.id)}
                      onChange={event => setLinked(current => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(document.id); else next.delete(document.id);
                        return next;
                      })} />
                    <span className="document-choice-title">{document.title}</span>
                    <span className="muted">{documentTypeLabel(document.contentType)}{document.archived ? " · Archived" : ""}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
      </fieldset>
      {warning ? (
        <div ref={warningRef} tabIndex={-1} className="settings-block criteria-warning" role="group" aria-labelledby="criteria-warning-heading">
          <h2 id="criteria-warning-heading">These acceptance criteria were accepted</h2>
          <p>
            {accepted
              ? <>This requirement was accepted on criteria version {accepted.criteriaVersion} by {accepted.decidedBy} on{" "}
                  <time dateTime={accepted.decidedAt}>{formatDate(accepted.decidedAt)}</time>. </>
              : <>The current acceptance criteria of this requirement have been accepted. </>}
            That acceptance applies to the previous criteria, not to your changes. If you save, your criteria become a new
            version, the requirement will need a new review, and the earlier decision stays in its history.
          </p>
          <div className="form-actions">
            <button className="button danger" type="submit" name="confirmCriteriaChange" value="true" disabled={pending}>
              {pending ? pendingLabel : "Save and request a new review"}
            </button>
            <button className="button secondary" type="button" disabled={pending} onClick={() => setWarning(false)}>Keep editing</button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className="button" type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</button>
          <Link className="button secondary" href={cancelHref}>Cancel</Link>
        </div>
      )}
    </form>
  );
}
