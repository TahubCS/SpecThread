import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft, CircleCheck, CircleDashed, CircleDot, CircleX, FilePlus2, GitCommitHorizontal, GitPullRequest, Link2, ListChecks, Scale, Tag,
  type LucideIcon,
} from "lucide-react";
import { EvidenceStatus } from "@/components/evidence-status";
import {
  listCriteriaVersions, listEvidence, listEvidenceHistory, listMembers, listReviews, requireProject, requireRequirement,
} from "@/lib/project-data";
import { formatDateTime } from "@/lib/projects";
import { buildThread, runningChecks, type ThreadEvent } from "@/lib/thread";

export const metadata: Metadata = { title: "Evidence thread" };

const external = { target: "_blank", rel: "noreferrer" } as const;

function iconFor(event: ThreadEvent): LucideIcon {
  switch (event.kind) {
    case "requirement": return FilePlus2;
    case "criteria": return ListChecks;
    case "link": return Link2;
    case "issue": return CircleDot;
    case "pull_request": return GitPullRequest;
    case "commit": return GitCommitHorizontal;
    case "release": return Tag;
    case "decision": return Scale;
    case "check": return event.result === "passed" ? CircleCheck : event.result === "failed" ? CircleX : CircleDashed;
  }
}

/**
 * One chronological thread for a requirement (US-16): its acceptance criteria at the top, then
 * everything that happened to it, oldest first and newest last, each with what happened, who did
 * it, and when. It reads the requirement's criteria versions, evidence links and their changes,
 * what GitHub reported for the linked work, and review decisions, so a reviewer doesn't have to
 * search several systems. It is read-only; changes are made on the requirement page.
 */
export default async function Page({ params }: PageProps<"/projects/[projectId]/requirements/[requirementId]/evidence">) {
  const { projectId, requirementId } = await params;
  const [project, requirement, members, evidence, history, reviews, versions] = await Promise.all([
    requireProject(projectId), requireRequirement(projectId, requirementId), listMembers(projectId), listEvidence(requirementId),
    listEvidenceHistory(requirementId), listReviews(requirementId), listCriteriaVersions(requirementId),
  ]);
  const people = Object.fromEntries(members.map(member => [member.userId, member.name]));
  const nameOf = (userId: string) => people[userId] ?? "a former member";
  const detail = `/projects/${project.id}/requirements/${requirement.id}`;
  const thread = buildThread({ requirement, versions, evidence, history, reviews, nameOf });
  const running = runningChecks(evidence);

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={detail}><ArrowLeft size={15} aria-hidden="true" /> {requirement.title}</Link>
      <header className="project-page-heading">
        <h1 id="page-title">Evidence thread</h1>
        {requirement.archivedAt && <span className="badge">Archived</span>}
      </header>
      <p className="requirement-meta">
        {requirement.title}
        {requirement.criteriaVersion !== null && <> · Acceptance criteria version {requirement.criteriaVersion}</>}
      </p>
      <section className="requirement-section" aria-labelledby="criteria-heading">
        <h2 id="criteria-heading">Acceptance criteria</h2>
        {requirement.acceptanceCriteria.length === 0
          ? <p className="muted">No acceptance criteria yet.</p>
          : (
            <ol className="criteria-list" aria-label="Acceptance criteria">
              {requirement.acceptanceCriteria.map(criterion => <li key={criterion.id}>{criterion.text}</li>)}
            </ol>
          )}
        <EvidenceStatus complete={requirement.evidenceComplete} missing={requirement.evidenceMissing} />
      </section>
      <section className="requirement-section" aria-labelledby="thread-heading">
        <h2 id="thread-heading">What happened, oldest first</h2>
        {history === null && (
          <p className="notice" role="status">Changes to the evidence links can&apos;t be shown right now. Try again in a few minutes.</p>
        )}
        {versions === null && (
          <p className="notice" role="status">Acceptance criteria versions can&apos;t be shown right now. Try again in a few minutes.</p>
        )}
        <ol className="thread-list" aria-label="Evidence thread">
          {thread.map(event => {
            const Icon = iconFor(event);
            return (
              <li key={event.id} className={`is-${event.kind}${event.result ? ` is-${event.result}` : ""}`}>
                <Icon className="thread-icon" size={15} strokeWidth={1.75} aria-hidden="true" />
                <div className="thread-body">
                  <p className="thread-text">
                    {event.url
                      ? <a href={event.url} {...external}>{event.text}<span className="sr-only"> (opens GitHub in a new tab)</span></a>
                      : event.text}
                  </p>
                  <p className="thread-meta">
                    {event.source === "github" ? (event.actor === "GitHub" ? "Reported by GitHub" : `By ${event.actor} on GitHub`) : `By ${event.actor}`}
                    {" · "}<time dateTime={event.at}>{formatDateTime(event.at)}</time>
                  </p>
                  {event.detail && <p className="thread-detail">{event.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        {running > 0 && (
          <p className="muted thread-note">
            {running === 1 ? "1 check is" : `${running} checks are`} still running and will appear once {running === 1 ? "it reports" : "they report"}.
          </p>
        )}
        <p className="muted thread-note">
          GitHub events are those of the work linked now, as of the last read from GitHub. Times are in UTC.{" "}
          <Link href={detail}>Change links or record a decision</Link> on the requirement page.
        </p>
      </section>
    </article>
  );
}
