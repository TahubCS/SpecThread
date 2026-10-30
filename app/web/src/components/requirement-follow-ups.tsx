"use client";

import Link from "next/link";
import { useActionState } from "react";
import { GitBranch } from "lucide-react";
import { addFollowUp, removeFollowUp } from "@/app/projects/follow-up-actions";
import { FOLLOW_UPS_MAX, followUpEventText, type FollowUps } from "@/lib/follow-ups";
import { formatDate } from "@/lib/projects";

/**
 * Renders a requirement's follow-up links (ADR-052): the requirements it follows up, which can be
 * removed while it is editable, and the requirements that follow it up, each linking to the other
 * requirement. `candidates` are the project's other active requirements that are not linked yet.
 * Every change is listed with who made it and when.
 */
export function RequirementFollowUps({ projectId, requirementId, followUps, candidates, people, editable }: {
  projectId: string;
  requirementId: string;
  followUps: FollowUps;
  candidates: { id: string; title: string }[];
  /** Names of the project's members by user ID. */
  people: Record<string, string>;
  editable: boolean;
}) {
  const [added, add, adding] = useActionState(addFollowUp.bind(null, projectId, requirementId), { error: null, changed: 0 });
  const [removed, remove, removing] = useActionState(removeFollowUp.bind(null, projectId, requirementId), { error: null, changed: 0 });
  const href = (id: string) => `/projects/${projectId}/requirements/${id}`;
  const nameOf = (userId: string) => people[userId] ?? "a former member";
  const { followUpOf, followedUpBy, history } = followUps;

  return (
    <>
      <h3 className="follow-up-heading">Follow-up of</h3>
      {followUpOf.length === 0
        ? <p className="muted">This requirement doesn&apos;t follow up another requirement.</p>
        : (
          <ul className="row-list" aria-label="Follow-up of">
            {followUpOf.map(link => (
              <li key={link.requirementId} className="follow-up-row">
                <Link className="row" href={href(link.requirementId)}>
                  <GitBranch size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className="row-title">{link.title}</span>
                  {link.archivedAt && <span className="badge">Archived</span>}
                  <span className="row-meta">Linked by {nameOf(link.linkedBy)} on <time dateTime={link.linkedAt}>{formatDate(link.linkedAt)}</time></span>
                </Link>
                {editable && (
                  <form action={remove}>
                    <input type="hidden" name="originalRequirementId" value={link.requirementId} />
                    <button className="button secondary" type="submit" disabled={removing} aria-label={`Remove follow-up link to ${link.title}`}>
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      {removed.error && <p role="alert" className="notice notice-error">{removed.error}</p>}
      {editable && (
        followUpOf.length >= FOLLOW_UPS_MAX
          ? <p className="muted follow-up-note">A requirement can follow up at most {FOLLOW_UPS_MAX} requirements.</p>
          : candidates.length === 0
          ? <p className="muted follow-up-note">There are no other active requirements in this project to link.</p>
          : (
            <form key={added.changed} className="evidence-link" action={add} aria-label="Add a follow-up link">
              <div className="field">
                <label htmlFor="follow-up-original">Mark as a follow-up of</label>
                <div className="evidence-link-row">
                  <select id="follow-up-original" name="originalRequirementId" defaultValue="" required
                    aria-invalid={added.error ? true : undefined} aria-describedby={added.error ? "follow-up-error" : undefined}>
                    <option value="" disabled>Choose a requirement</option>
                    {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
                  </select>
                  <button className="button secondary" type="submit" disabled={adding}>{adding ? "Adding..." : "Add"}</button>
                </div>
                {added.error && <p id="follow-up-error" role="alert" className="notice notice-error">{added.error}</p>}
              </div>
            </form>
          )
      )}
      <h3 className="follow-up-heading">Followed up by</h3>
      {followedUpBy.length === 0
        ? <p className="muted">No requirement follows up this one.</p>
        : (
          <ul className="row-list" aria-label="Followed up by">
            {followedUpBy.map(link => (
              <li key={link.requirementId}>
                <Link className="row" href={href(link.requirementId)}>
                  <GitBranch size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className="row-title">{link.title}</span>
                  {link.archivedAt && <span className="badge">Archived</span>}
                  <span className="row-meta">Linked by {nameOf(link.linkedBy)} on <time dateTime={link.linkedAt}>{formatDate(link.linkedAt)}</time></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      {history.length > 0 && (
        <details className="review-history">
          <summary>{history.length === 1 ? "1 link change" : `${history.length} link changes`}</summary>
          <FollowUpHistory requirementId={requirementId} history={history} people={people} />
        </details>
      )}
    </>
  );
}

/** Lists follow-up link changes, newest first, with who made each and when. */
export function FollowUpHistory({ requirementId, history, people }: {
  requirementId: string; history: FollowUps["history"]; people: Record<string, string>;
}) {
  return (
    <ol className="follow-up-history" aria-label="Follow-up link changes">
      {history.map(event => (
        <li key={event.id}>
          <span>{followUpEventText(event, requirementId)}</span>{" "}
          <span className="muted">
            by {people[event.actor] ?? "a former member"} on <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
          </span>
        </li>
      ))}
    </ol>
  );
}
