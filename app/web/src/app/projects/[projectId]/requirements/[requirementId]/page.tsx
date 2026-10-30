import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, Pencil } from "lucide-react";
import { EvidenceHistory, EvidencePanel } from "@/components/evidence-panel";
import { RequirementArchive, RequirementRestore } from "@/components/requirement-archive";
import { RequirementFollowUps } from "@/components/requirement-follow-ups";
import { RequirementMilestone } from "@/components/requirement-milestone";
import { ReviewPanel } from "@/components/review-panel";
import { documentTypeLabel } from "@/lib/documents";
import { getProjectRepository } from "@/lib/github-data";
import {
  listEvidence, listEvidenceHistory, listFollowUps, listMembers, listMilestones, listRequirements, listReviews, requireProject, requireRequirement, viewerId,
} from "@/lib/project-data";
import { formatDate } from "@/lib/projects";

type Props = PageProps<"/projects/[projectId]/requirements/[requirementId]">;

/** The evidence actions on this page may read GitHub for up to a minute (ADR-048). */
export const maxDuration = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId, requirementId } = await params;
  return { title: (await requireRequirement(projectId, requirementId)).title };
}

/**
 * Shows who created a requirement and when, its description, ordered acceptance criteria and their
 * version, milestone, linked documents, follow-up links, evidence, and review decisions, with
 * edit and archive while it can change.
 */
export default async function Page({ params }: Props) {
  const { projectId, requirementId } = await params;
  // One round of parallel reads. Each is authorized by the API, and requireRequirement still
  // shows the not-found page before anything renders when the requirement is in another project.
  const [project, requirement, members, repository, evidence, reviews, viewer, followUps, requirements, milestones, evidenceHistory] = await Promise.all([
    requireProject(projectId), requireRequirement(projectId, requirementId), listMembers(projectId),
    getProjectRepository(projectId), listEvidence(requirementId), listReviews(requirementId), viewerId(),
    listFollowUps(requirementId), listRequirements(projectId), listMilestones(projectId), listEvidenceHistory(requirementId),
  ]);
  const people = Object.fromEntries(members.map(member => [member.userId, member.name]));
  const nameOf = (userId: string) => people[userId] ?? "a former member";
  const editable = !project.archivedAt && !requirement.archivedAt;
  const base = `/projects/${project.id}/requirements`;
  // Requirements this one could follow up: not itself, and not already linked either way.
  const linked = new Set([requirement.id, ...[...followUps.followUpOf, ...followUps.followedUpBy].map(link => link.requirementId)]);
  const candidates = requirements.filter(other => !linked.has(other.id)).map(({ id, title }) => ({ id, title }));

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={base}><ArrowLeft size={15} aria-hidden="true" /> Requirements</Link>
      <header className="project-page-heading">
        <h1 id="page-title">{requirement.title}</h1>
        {requirement.archivedAt && <span className="badge">Archived</span>}
        {editable && <Link className="button secondary" href={`${base}/${requirement.id}/edit`}><Pencil size={14} aria-hidden="true" /> Edit</Link>}
      </header>
      <p className="requirement-meta">
        Version {requirement.version} · Created by {nameOf(requirement.createdBy)} on <time dateTime={requirement.createdAt}>{formatDate(requirement.createdAt)}</time>
        {" "}· Updated by {nameOf(requirement.updatedBy)} on <time dateTime={requirement.updatedAt}>{formatDate(requirement.updatedAt)}</time>
        {requirement.criteriaVersion !== null && <>
          {" "}· <Link href={`${base}/${requirement.id}/history`}>Criteria version {requirement.criteriaVersion}</Link>
        </>}
      </p>
      {requirement.archivedAt && (
        <p className="notice">
          This requirement was archived on {formatDate(requirement.archivedAt)}. It can&apos;t be edited or reviewed until it is restored.
        </p>
      )}
      <section className="requirement-section" aria-labelledby="description-heading">
        <h2 id="description-heading">Description</h2>
        {requirement.description
          ? <p className="requirement-description">{requirement.description}</p>
          : <p className="muted">No description.</p>}
      </section>
      <section className="requirement-section" aria-labelledby="criteria-heading">
        <h2 id="criteria-heading">Acceptance criteria</h2>
        {requirement.acceptanceCriteria.length === 0
          ? <p className="muted">No acceptance criteria yet.</p>
          : (
            <ol className="criteria-list" aria-label="Acceptance criteria">
              {requirement.acceptanceCriteria.map(criterion => <li key={criterion.id}>{criterion.text}</li>)}
            </ol>
          )}
      </section>
      <section className="requirement-section" aria-labelledby="milestone-heading">
        <h2 id="milestone-heading">Milestone</h2>
        <RequirementMilestone projectId={project.id} requirementId={requirement.id}
          milestone={requirement.milestone} milestones={milestones} editable={editable} />
      </section>
      <section className="requirement-section" aria-labelledby="documents-heading">
        <h2 id="documents-heading">Reference documents</h2>
        {requirement.documents.length === 0
          ? <p className="muted">No documents linked.</p>
          : (
            <ul className="row-list" aria-label="Reference documents">
              {requirement.documents.map(document => (
                <li key={document.id}>
                  <Link className="row" href={`/projects/${project.id}/documents/${document.id}`}>
                    <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="row-title">{document.title}</span>
                    <span className="row-meta">{documentTypeLabel(document.contentType)}</span>
                    {document.archivedAt && <span className="badge">Archived</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
      <section className="requirement-section" aria-labelledby="follow-ups-heading">
        <h2 id="follow-ups-heading">Follow-ups</h2>
        <RequirementFollowUps projectId={project.id} requirementId={requirement.id} followUps={followUps}
          candidates={candidates} people={people} editable={editable} />
      </section>
      <section className="requirement-section" aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">Evidence</h2>
        {repository || evidence.length > 0 ? (
          <EvidencePanel projectId={project.id} requirementId={requirement.id} evidence={evidence} history={evidenceHistory}
            repository={repository?.fullName ?? evidence[0].repository} editable={editable && repository !== null}
            people={people} />
        ) : (
          <>
            <p className="muted">
              Connect a GitHub repository in <Link href={`/projects/${project.id}/settings/repository`}>project settings</Link> to
              link issues, pull requests, commits, and releases.
            </p>
            {/* Links removed before the repository was disconnected stay in the record (ADR-054). */}
            {evidenceHistory && evidenceHistory.length > 0 && (
              <details className="review-history">
                <summary>{evidenceHistory.length === 1 ? "1 link change" : `${evidenceHistory.length} link changes`}</summary>
                <EvidenceHistory history={evidenceHistory} people={people} />
              </details>
            )}
          </>
        )}
        {repository === null && evidence.length > 0 && (
          <p className="notice">
            No repository is connected, so these links cannot be changed or refreshed.{" "}
            <Link href={`/projects/${project.id}/settings/repository`}>Connect a repository</Link>
          </p>
        )}
      </section>
      <section className="requirement-section" aria-labelledby="review-heading">
        <h2 id="review-heading">Review</h2>
        <ReviewPanel projectId={project.id} requirementId={requirement.id} version={requirement.version}
          criteriaVersion={requirement.criteriaVersion} reviews={reviews}
          evidenceIds={evidence.map(link => link.id)} people={people}
          canReview={!editable ? "read-only" : viewer === requirement.createdBy ? "author" : "yes"}
          soloTeam={members.length === 1 ? { name: project.teamName, invitations: `/teams/${project.teamId}/invitations` } : null} />
      </section>
      {editable && <RequirementArchive projectId={project.id} requirementId={requirement.id} />}
      {requirement.archivedAt && !project.archivedAt && <RequirementRestore projectId={project.id} requirementId={requirement.id} />}
    </article>
  );
}
