import type { Metadata } from "next";
import { createRequirement } from "@/app/projects/requirement-actions";
import { RequirementForm } from "@/components/requirement-form";
import { listDocuments, requireProject } from "@/lib/project-data";
import { documentChoices } from "@/lib/requirements";

export const metadata: Metadata = { title: "New requirement" };

/** Renders the form that adds a requirement to a project. Archived projects explain why they cannot take one. */
export default async function Page({ params }: PageProps<"/projects/[projectId]/requirements/new">) {
  const { projectId } = await params;
  const [project, documents] = await Promise.all([requireProject(projectId), listDocuments(projectId)]);
  const list = `/projects/${project.id}/requirements`;

  return (
    <section className="project-page is-form" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">New requirement</h1>
      </header>
      {project.archivedAt
        ? <p className="notice">This project is archived, so requirements can&apos;t be added.</p>
        : <RequirementForm action={createRequirement.bind(null, project.id)} initial={{ title: "", description: "", criteria: [], documentIds: [] }}
            documents={documentChoices(documents, [])} documentsHref={`/projects/${project.id}/documents`}
            label="New requirement" submitLabel="Create requirement" pendingLabel="Creating..." cancelHref={list} />}
    </section>
  );
}
