import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FollowUpHistory } from "@/components/requirement-follow-ups";
import { listCriteriaVersions, listFollowUps, listMembers, listReviews, requireProject, requireRequirement } from "@/lib/project-data";
import { formatDate } from "@/lib/projects";
import { decisionText } from "@/lib/reviews";

export const metadata: Metadata = { title: "Requirement history" };

/**
 * Shows how a requirement changed: every version of its acceptance criteria with who saved it,
 * when, and the decisions made against it (ADR-051), and every follow-up link added or removed
 * (ADR-052). Earlier versions open read-only.
 */
export default async function Page({ params }: PageProps<"/projects/[projectId]/requirements/[requirementId]/history">) {
  const { projectId, requirementId } = await params;
  const [project, requirement, versions, followUps, reviews, members] = await Promise.all([
    requireProject(projectId), requireRequirement(projectId, requirementId), listCriteriaVersions(requirementId),
    listFollowUps(requirementId), listReviews(requirementId), listMembers(projectId),
  ]);
  const people = Object.fromEntries(members.map(member => [member.userId, member.name]));
  const nameOf = (userId: string) => people[userId] ?? "a former member";
  const detail = `/projects/${project.id}/requirements/${requirement.id}`;

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={detail}><ArrowLeft size={15} aria-hidden="true" /> {requirement.title}</Link>
      <header className="project-page-heading">
        <h1 id="page-title">Requirement history</h1>
      </header>
      <section className="requirement-section" aria-labelledby="versions-heading">
        <h2 id="versions-heading">Acceptance criteria versions</h2>
        {versions === null
          ? <p className="notice" role="status">Criteria versions can&apos;t be shown right now. Try again in a few minutes.</p>
          : versions.length === 0
          ? <p className="muted">No criteria versions have been recorded yet.</p>
          : (
            <ol className="history-list" aria-label="Acceptance criteria versions">
              {versions.map(version => {
                const decisions = reviews.filter(review => review.criteriaVersion === version.number);
                return (
                  <li key={version.number}>
                    <p>
                      <Link href={`${detail}/criteria/${version.number}`}>Version {version.number}</Link>
                      {version.number === requirement.criteriaVersion && <span className="badge">Current</span>}
                      <span className="muted">
                        {" "}{version.criteria.length === 1 ? "1 criterion" : `${version.criteria.length} criteria`}, saved by {nameOf(version.createdBy)} on{" "}
                        <time dateTime={version.createdAt}>{formatDate(version.createdAt)}</time>
                      </span>
                    </p>
                    {decisions.length > 0 && (
                      <ul className="history-decisions" aria-label={`Decisions on version ${version.number}`}>
                        {decisions.map(review => (
                          <li key={review.id}>
                            {decisionText[review.decision]} by {nameOf(review.decidedBy)} on{" "}
                            <time dateTime={review.decidedAt}>{formatDate(review.decidedAt)}</time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
      </section>
      <section className="requirement-section" aria-labelledby="follow-up-history-heading">
        <h2 id="follow-up-history-heading">Follow-up links</h2>
        {followUps.history.length === 0
          ? <p className="muted">No follow-up links have been added or removed.</p>
          : <div className="review-history"><FollowUpHistory requirementId={requirement.id} history={followUps.history} people={people} /></div>}
      </section>
    </article>
  );
}
