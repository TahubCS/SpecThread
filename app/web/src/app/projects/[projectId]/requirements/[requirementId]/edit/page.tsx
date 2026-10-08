import type { Metadata } from "next";
import { updateRequirement } from "@/app/projects/requirement-actions";
import { RequirementForm } from "@/components/requirement-form";
import { requireProject, requireRequirement } from "@/lib/project-data";

export const metadata: Metadata = { title: "Edit requirement" };

/**
 * Renders the form that changes a requirement. The save carries the version loaded here, so a
 * save made by someone else in the meantime is not overwritten. Archived items explain why they cannot change.
 */
export default async function Page({ params }: PageProps<"/projects/[projectId]/requirements/[requirementId]/edit">) {
  const { projectId, requirementId } = await params;
  const project = await requireProject(projectId);
  const requirement = await requireRequirement(projectId, requirementId);
  const detail = `/projects/${project.id}/requirements/${requirement.id}`;

  return (
    <section className="project-page is-form" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Edit requirement</h1>
      </header>
      {project.archivedAt || requirement.archivedAt
        ? <p className="notice">This requirement is archived and can no longer be changed.</p>
        : <RequirementForm key={requirement.version}
            action={updateRequirement.bind(null, project.id, requirement.id, requirement.version)}
            initial={{ title: requirement.title, description: requirement.description, criteria: requirement.acceptanceCriteria.map(criterion => criterion.text) }}
            label="Edit requirement" submitLabel="Save changes" pendingLabel="Saving..." cancelHref={detail} />}
    </section>
  );
}
