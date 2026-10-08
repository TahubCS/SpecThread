"use client";

import { startTransition, useActionState, useState } from "react";
import { Lock } from "lucide-react";
import { connectRepository, disconnectRepository } from "@/app/projects/repository-actions";
import type { AvailableRepository } from "@/lib/repositories";

/** Renders the repositories a manager may connect as a single-choice list with a Connect button. */
export function RepositoryPicker({ projectId, repositories }: { projectId: string; repositories: AvailableRepository[] }) {
  const [state, action, pending] = useActionState(connectRepository.bind(null, projectId), { error: null });
  const [selected, setSelected] = useState("");

  return (
    // Submitted by hand: a form action would reset the form, and with it the chosen repository, after a refused attempt.
    <form className="repository-picker" aria-label="Connect a repository" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(() => action(data));
    }}>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
      <fieldset>
        <legend>Choose a repository</legend>
        <ul className="row-list">
          {repositories.map(repository => (
            <li key={`${repository.installationId}:${repository.repositoryId}`}>
              <label className="row">
                <input type="radio" name="repository" required value={`${repository.installationId}:${repository.repositoryId}`}
                  checked={selected === `${repository.installationId}:${repository.repositoryId}`}
                  onChange={event => setSelected(event.target.value)} />
                <span className="row-title">{repository.fullName}</span>
                {repository.isPrivate && <span className="badge"><Lock size={11} aria-hidden="true" /> Private</span>}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>{pending ? "Connecting..." : "Connect repository"}</button>
      </div>
    </form>
  );
}

/** Renders the disconnect action for a project's repository, which asks for confirmation first. */
export function RepositoryDisconnect({ projectId, fullName }: { projectId: string; fullName: string }) {
  const [state, action, pending] = useActionState(disconnectRepository.bind(null, projectId), { error: null });
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="settings-block is-danger" aria-labelledby="disconnect-heading">
      <h2 id="disconnect-heading">Disconnect repository</h2>
      <p>SpecThread stops reading from {fullName}. You can connect it, or another repository, again later.</p>
      {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
      {confirming ? (
        <form className="form-actions" action={action} aria-label="Confirm disconnect">
          <button className="button danger" type="submit" disabled={pending}>{pending ? "Disconnecting..." : "Yes, disconnect"}</button>
          <button className="button secondary" type="button" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
        </form>
      ) : (
        <button className="button secondary" type="button" onClick={() => setConfirming(true)}>Disconnect repository</button>
      )}
    </section>
  );
}
