"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createTeam, finishOnboarding, type CreateTeamState } from "@/app/teams/new/actions";
import styles from "./teams.module.css";

const initialState: CreateTeamState = { values: { name: "", description: "" }, errors: {} };

/** Create form with preserved inputs, field errors, and a pending state. */
export function CreateTeamForm({ initial = false }: { initial?: boolean }) {
  const [state, action, pending] = useActionState(initial ? finishOnboarding : createTeam, initialState);
  return <form className={styles.form} action={action} aria-busy={pending}>
    <label className={styles.field} htmlFor="team-name">
      <span>Team name</span>
      <input id="team-name" name="name" required maxLength={200} defaultValue={state.values.name}
        aria-invalid={!!state.errors.name} aria-describedby={state.errors.name ? "team-name-error" : undefined} />
      {state.errors.name && <span className={styles.error} id="team-name-error">{state.errors.name.join(" ")}</span>}
    </label>
    <label className={styles.field} htmlFor="team-description">
      <span>Description <span className={styles.hint}>(optional)</span></span>
      <textarea id="team-description" name="description" maxLength={10_000} defaultValue={state.values.description}
        aria-invalid={!!state.errors.description} aria-describedby={state.errors.description ? "team-description-error" : undefined} />
      {state.errors.description && <span className={styles.error} id="team-description-error">{state.errors.description.join(" ")}</span>}
    </label>
    <p className={styles.hint}>You’ll be the team owner.</p>
    {state.message && <p className={styles.error} role="alert">{state.message}</p>}
    <div className={styles.actions}>
      <button className={styles.primary} type="submit" disabled={pending}>{pending ? "Creating…" : "Create team"}</button>
      {!initial && <Link className={styles.secondary} href="/teams">Cancel</Link>}
    </div>
  </form>;
}
