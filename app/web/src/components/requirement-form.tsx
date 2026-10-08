"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { RequirementFormState } from "@/app/projects/requirement-actions";
import {
  CRITERIA_MAX, CRITERION_MAX, moveItem, REQUIREMENT_DESCRIPTION_MAX, REQUIREMENT_TITLE_MAX, type RequirementInput,
} from "@/lib/requirements";

type FormAction = (state: RequirementFormState, formData: FormData) => Promise<RequirementFormState>;

/**
 * Renders the form for a requirement's title, description, and ordered acceptance criteria.
 * Criteria can be moved up and down; the order on screen is the order saved. Fields keep what
 * the user typed when the server rejects the form, and each message appears next to the field
 * it is about, also after its criterion has been moved.
 */
export function RequirementForm({ action, initial, submitLabel, pendingLabel, cancelHref, label }: {
  action: FormAction;
  initial: RequirementInput;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, { errors: null });
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [rows, setRows] = useState(() => initial.criteria.map((text, key) => ({ key, text })));
  const nextKey = useRef(initial.criteria.length);
  // Row keys in the order last sent. Messages about a criterion name its position in that order.
  const [sent, setSent] = useState<number[]>([]);
  const [moved, setMoved] = useState("");
  const errors = state.errors;
  const move = (index: number, to: number) => {
    if (to < 0 || to >= rows.length) return;
    setRows(current => moveItem(current, index, to));
    setMoved(`Criterion moved to position ${to + 1} of ${rows.length}.`);
  };

  return (
    <form className="requirement-form" action={formAction} aria-label={label} onSubmit={() => setSent(rows.map(row => row.key))}>
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
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</button>
        <Link className="button secondary" href={cancelHref}>Cancel</Link>
      </div>
    </form>
  );
}
