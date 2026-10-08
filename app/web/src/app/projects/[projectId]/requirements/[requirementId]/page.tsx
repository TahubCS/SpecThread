import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { RequirementArchive } from "@/components/requirement-archive";
import { listMembers, requireProject, requireRequirement } from "@/lib/project-data";
import { formatDate } from "@/lib/projects";

type Props = PageProps<"/projects/[projectId]/requirements/[requirementId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId, requirementId } = await params;
  return { title: (await requireRequirement(projectId, requirementId)).title };
}

/** Shows a requirement's description and ordered acceptance criteria, with edit and archive while it can change. */
export default async function Page({ params }: Props) {
  const { projectId, requirementId } = await params;
  const project = await requireProject(projectId);
  const [requirement, members] = await Promise.all([requireRequirement(projectId, requirementId), listMembers(projectId)]);
  const author = members.find(member => member.userId === requirement.createdBy)?.name ?? "a former member";
  const editable = !project.archivedAt && !requirement.archivedAt;
  const base = `/projects/${project.id}/requirements`;

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={base}><ArrowLeft size={15} aria-hidden="true" /> Requirements</Link>
      <header className="project-page-heading">
        <h1 id="page-title">{requirement.title}</h1>
        {requirement.archivedAt && <span className="badge">Archived</span>}
        {editable && <Link className="button secondary" href={`${base}/${requirement.id}/edit`}><Pencil size={14} aria-hidden="true" /> Edit</Link>}
      </header>
      <p className="requirement-meta">
        Version {requirement.version} · Updated <time dateTime={requirement.updatedAt}>{formatDate(requirement.updatedAt)}</time> · Created by {author}
      </p>
      {requirement.archivedAt && (
        <p className="notice">This requirement was archived on {formatDate(requirement.archivedAt)} and can no longer be changed.</p>
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
      {editable && <RequirementArchive projectId={project.id} requirementId={requirement.id} />}
    </article>
  );
}
