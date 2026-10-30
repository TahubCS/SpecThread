import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listMembers, listReviews, requireCriteriaVersion, requireProject, requireRequirement } from "@/lib/project-data";
import { formatDate } from "@/lib/projects";
import { decisionText } from "@/lib/reviews";

type Props = PageProps<"/projects/[projectId]/requirements/[requirementId]/criteria/[version]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { version } = await params;
  return { title: `Acceptance criteria version ${version}` };
}

/**
 * Shows one saved version of a requirement's acceptance criteria, read-only, with who saved it,
 * when, and the decisions made against it, so a past decision can be read against what it
 * approved (ADR-051).
 */
export default async function Page({ params }: Props) {
  const { projectId, requirementId, version: number } = await params;
  const [project, requirement] = await Promise.all([requireProject(projectId), requireRequirement(projectId, requirementId)]);
  const [version, reviews, members] = await Promise.all([
    requireCriteriaVersion(requirement.id, number), listReviews(requirement.id), listMembers(projectId),
  ]);
  const people = Object.fromEntries(members.map(member => [member.userId, member.name]));
  const nameOf = (userId: string) => people[userId] ?? "a former member";
  const detail = `/projects/${project.id}/requirements/${requirement.id}`;
  const decisions = reviews.filter(review => review.criteriaVersion === version.number);
  const current = version.number === requirement.criteriaVersion;

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={`${detail}/history`}><ArrowLeft size={15} aria-hidden="true" /> Requirement history</Link>
      <header className="project-page-heading">
        <h1 id="page-title">Acceptance criteria, version {version.number}</h1>
        {current && <span className="badge">Current</span>}
      </header>
      <p className="requirement-meta">
        {requirement.title} · Saved by {nameOf(version.createdBy)} on <time dateTime={version.createdAt}>{formatDate(version.createdAt)}</time>
      </p>
      <p className="notice" role="note">
        {current
          ? <>These are the requirement&apos;s current acceptance criteria, shown read-only. </>
          : <>This is an earlier version, shown read-only. The current criteria are version {requirement.criteriaVersion ?? "unknown"}. </>}
        <Link href={detail}>Open the requirement</Link>
      </p>
      <section className="requirement-section" aria-labelledby="criteria-heading">
        <h2 id="criteria-heading">Acceptance criteria</h2>
        {version.criteria.length === 0
          ? <p className="muted">This version has no acceptance criteria.</p>
          : (
            <ol className="criteria-list" aria-label={`Acceptance criteria, version ${version.number}`}>
              {version.criteria.map((text, index) => <li key={index}>{text}</li>)}
            </ol>
          )}
      </section>
      <section className="requirement-section" aria-labelledby="decisions-heading">
        <h2 id="decisions-heading">Decisions on this version</h2>
        {decisions.length === 0
          ? <p className="muted">No decision was made against this version.</p>
          : (
            <ul className="history-decisions" aria-label="Decisions on this version">
              {decisions.map(review => (
                <li key={review.id}>
                  {decisionText[review.decision]} by {nameOf(review.decidedBy)} on{" "}
                  <time dateTime={review.decidedAt}>{formatDate(review.decidedAt)}</time>
                  {review.note && <p className="review-note">{review.note}</p>}
                </li>
              ))}
            </ul>
          )}
      </section>
    </article>
  );
}
