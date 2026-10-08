"use client";

import { useActionState, useState } from "react";
import { CircleDot, GitCommitHorizontal, GitPullRequest, RefreshCw, X } from "lucide-react";
import { linkEvidence, refreshEvidence, unlinkEvidence } from "@/app/projects/evidence-actions";
import { checkSummary, EVIDENCE_REFERENCE_MAX, evidenceChanges, evidenceLabel, type Evidence } from "@/lib/evidence";
import { formatDate } from "@/lib/projects";

const stateText = { open: "Open", closed: "Closed", merged: "Merged" } as const;
const kindText = { issue: "issue", pull_request: "pull request", commit: "commit" } as const;
const icons = { issue: CircleDot, pull_request: GitPullRequest, commit: GitCommitHorizontal } as const;
const resultText = { passed: "Passed", failed: "Failed", running: "Running", skipped: "Skipped", cancelled: "Cancelled", neutral: "Neutral" } as const;
const external = { target: "_blank", rel: "noreferrer" } as const;

/**
 * Renders a requirement's linked issues, pull requests, and commits as a timeline, oldest first,
 * with what GitHub reported when they were last read. Pull requests and commits show what
 * changed and the results of their automated checks, and a pull request lists its commits. A
 * link that began as a suggestion names the person who confirmed it. While the requirement can
 * change, members add a link, remove one, and read everything from GitHub again.
 */
export function EvidencePanel({ projectId, requirementId, evidence, repository, people, editable }: {
  projectId: string;
  requirementId: string;
  evidence: Evidence[];
  repository: string;
  /** Names of the project's members by user ID, for naming who confirmed a suggested link. */
  people: Record<string, string>;
  editable: boolean;
}) {
  const [link, linkAction, linking] = useActionState(linkEvidence.bind(null, projectId, requirementId), { reference: "", error: null, linked: 0 });
  const [refreshed, refreshAction, refreshing] = useActionState(refreshEvidence.bind(null, projectId, requirementId), { error: null });
  const [unlinked, unlinkAction, unlinking] = useActionState(unlinkEvidence.bind(null, projectId, requirementId), { error: null });
  const lastChecked = evidence.map(item => item.refreshedAt).sort().at(-1);

  return (
    <>
      {evidence.length === 0 ? (
        <p className="muted">No issues, pull requests, or commits are linked yet.</p>
      ) : (
        <ul className="row-list evidence-rows" aria-label="Linked evidence">
          {evidence.map(item => {
            const Icon = icons[item.kind];
            const label = evidenceLabel(item);
            const changes = evidenceChanges(item);
            return (
              <li key={item.id}>
                <div className="row">
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className="evidence-number">{label}</span>
                  <a className="row-title" href={item.url} {...external}>
                    {item.title}<span className="sr-only"> (opens GitHub in a new tab)</span>
                  </a>
                  {item.state ? (
                    <span className={`badge evidence-state is-${item.state}`}>
                      <span aria-hidden="true" />{stateText[item.state]}<span className="sr-only"> {kindText[item.kind]}</span>
                    </span>
                  ) : <span className="badge">Commit</span>}
                  <span className="row-meta">
                    {item.author ? `${item.author} · ` : ""}<time dateTime={item.githubCreatedAt}>{formatDate(item.githubCreatedAt)}</time>
                  </span>
                  {editable && (
                    <form action={unlinkAction}>
                      <input type="hidden" name="evidenceId" value={item.id} />
                      <button type="submit" className="icon-button" disabled={unlinking} aria-label={`Remove link to ${label}`}>
                        <X size={15} aria-hidden="true" />
                      </button>
                    </form>
                  )}
                </div>
                {item.kind === "commit" && changes && <p className="evidence-changes">{changes}</p>}
                {item.kind === "pull_request" && item.commits && <PullRequestCommits item={item} changes={changes} />}
                <Checks item={item} />
                {item.source === "suggested" && (
                  <p className="evidence-changes">Suggested, confirmed by {people[item.linkedBy] ?? "a former member"}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {unlinked.error && <p role="alert" className="notice notice-error">{unlinked.error}</p>}
      {evidence.length > 0 && (
        <form className="evidence-refresh" action={refreshAction}>
          <span className="muted">
            From {repository}. {lastChecked && <>Last read from GitHub <time dateTime={lastChecked}>{formatDate(lastChecked)}</time>.</>}
          </span>
          {editable && (
            <button className="button secondary" type="submit" disabled={refreshing}>
              <RefreshCw size={14} aria-hidden="true" /> {refreshing ? "Refreshing..." : "Refresh from GitHub"}
            </button>
          )}
        </form>
      )}
      {refreshed.error && <p role="alert" className="notice notice-error">{refreshed.error}</p>}
      {editable && <LinkForm key={link.linked} action={linkAction} pending={linking} state={link} repository={repository} />}
    </>
  );
}

/** Renders a pull request's totals with its commits, which open on demand. */
function PullRequestCommits({ item, changes }: { item: Evidence; changes: string | null }) {
  const commits = item.commits ?? [];
  const total = item.commitCount ?? commits.length;
  const summary = `${total === 1 ? "1 commit" : `${total} commits`}${changes ? `, ${changes}` : ""}`;
  if (commits.length === 0) return <p className="evidence-changes">{summary}</p>;
  return (
    <details className="evidence-commits">
      <summary>{summary}</summary>
      <ol aria-label={`Commits in #${item.number}`}>
        {commits.map(commit => (
          <li key={commit.sha}>
            <span className="evidence-number">{commit.sha.slice(0, 7)}</span>
            <a href={commit.url} {...external}>{commit.message}<span className="sr-only"> (opens GitHub in a new tab)</span></a>
            <span className="row-meta">
              {commit.author ? `${commit.author} · ` : ""}<time dateTime={commit.date}>{formatDate(commit.date)}</time>
            </span>
          </li>
        ))}
      </ol>
      {total > commits.length && <p className="muted">Showing the first {commits.length} of {total} commits.</p>}
    </details>
  );
}

/**
 * Renders the check results of a commit, or of a pull request's latest commit: a one-line count,
 * and each check with its result in words on demand. Renders nothing for issues.
 */
function Checks({ item }: { item: Evidence }) {
  const summary = checkSummary(item);
  if (!summary) return null;
  const checks = item.checks ?? [];
  if (checks.length === 0) return <p className="evidence-changes">{summary}</p>;
  const total = Math.max(item.checkCount ?? 0, checks.length);
  return (
    <details className="evidence-commits">
      <summary>{summary}</summary>
      <ul aria-label={`Checks for ${evidenceLabel(item)}`}>
        {checks.map((check, index) => (
          <li key={`${check.kind}-${check.name}-${index}`}>
            <span className={`check-result is-${check.result}`}><span aria-hidden="true" />{resultText[check.result]}</span>
            {check.url
              ? <a href={check.url} {...external}>{check.name}<span className="sr-only"> (opens GitHub in a new tab)</span></a>
              : <span className="check-name">{check.name}</span>}
            {check.completedAt && <span className="row-meta"><time dateTime={check.completedAt}>{formatDate(check.completedAt)}</time></span>}
          </li>
        ))}
      </ul>
      {total > checks.length && <p className="muted">Showing the first {checks.length} of {total} checks.</p>}
    </details>
  );
}

/** Renders the field for adding a link. Remounted after each successful link, which clears it. */
function LinkForm({ action, pending, state, repository }: {
  action: (formData: FormData) => void;
  pending: boolean;
  state: { reference: string; error: string | null };
  repository: string;
}) {
  const [reference, setReference] = useState(state.reference);
  return (
    <form className="evidence-link" action={action} aria-label="Link evidence">
      <div className="field">
        <label htmlFor="evidence-reference">Link an issue, pull request, or commit from {repository}</label>
        <div className="evidence-link-row">
          <input id="evidence-reference" name="reference" type="text" autoComplete="off" required maxLength={EVIDENCE_REFERENCE_MAX}
            placeholder="42, a commit SHA, or a GitHub link" value={reference} onChange={event => setReference(event.target.value)}
            aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? "evidence-reference-error" : undefined} />
          <button className="button" type="submit" disabled={pending}>{pending ? "Linking..." : "Link"}</button>
        </div>
        {state.error && <p id="evidence-reference-error" role="alert" className="notice notice-error">{state.error}</p>}
      </div>
    </form>
  );
}
