import type { Metadata } from "next";
import Link from "next/link";
import { updateRequirement } from "@/app/projects/requirement-actions";
import { RequirementForm } from "@/components/requirement-form";
import { listDocuments, listMembers, listReviews, requireProject, requireRequirement } from "@/lib/project-data";
import { documentChoices } from "@/lib/requirements";

export const metadata: Metadata = { title: "Edit requirement" };

/**
 * Renders the form that changes a requirement. The save carries the version loaded here, so a
 * save made by someone else in the meantime is not overwritten. Archived items explain why they cannot change.
 * When the latest decision accepted the current criteria, the form warns before changing them (ADR-051).
 */
export default async function Page({ params }: PageProps<"/projects/[projectId]/requirements/[requirementId]/edit">) {
  const { projectId, requirementId } = await params;
  const [project, requirement, documents, reviews, members] = await Promise.all([
    requireProject(projectId), requireRequirement(projectId, requirementId), listDocuments(projectId),
    listReviews(requirementId), listMembers(projectId),
  ]);
  const detail = `/projects/${project.id}/requirements/${requirement.id}`;
  const latest = reviews[0];
  const accepted = latest?.decision === "accepted" && latest.criteriaVersion !== null && latest.criteriaVersion === requirement.criteriaVersion
    ? {
      criteriaVersion: latest.criteriaVersion,
      decidedBy: members.find(member => member.userId === latest.decidedBy)?.name ?? "a former member",
      decidedAt: latest.decidedAt,
    }
    : null;

  return (
    <section className="project-page is-form" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Edit requirement</h1>
      </header>
      {project.archivedAt
        ? <p className="notice">This requirement is archived and can no longer be changed.</p>
        : requirement.archivedAt
        ? <p className="notice">This requirement is archived. <Link href={detail}>Restore it</Link> to edit it again.</p>
        : <RequirementForm key={requirement.version}
            action={updateRequirement.bind(null, project.id, requirement.id, requirement.version)}
            initial={{
              title: requirement.title, description: requirement.description,
              criteria: requirement.acceptanceCriteria.map(criterion => criterion.text),
              documentIds: requirement.documents.map(document => document.id),
            }}
            documents={documentChoices(documents, requirement.documents)} documentsHref={`/projects/${project.id}/documents`}
            label="Edit requirement" submitLabel="Save changes" pendingLabel="Saving..." cancelHref={detail} accepted={accepted} />}
    </section>
  );
}
