import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { RequirementRows } from "@/components/requirement-rows";
import { listRequirements, requireProject } from "@/lib/project-data";

export const metadata: Metadata = { title: "Requirements" };

/** Lists a project's active requirements, oldest first, as the API returns them. */
export default async function Page({ params }: PageProps<"/projects/[projectId]/requirements">) {
  const { projectId } = await params;
  const project = await requireProject(projectId);
  const requirements = await listRequirements(projectId);

  return (
    <section className="project-page" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Requirements</h1>
        <span className="count">{requirements.length}</span>
        {!project.archivedAt && (
          <Link className="button" href={`/projects/${project.id}/requirements/new`}><Plus size={16} aria-hidden="true" /> New requirement</Link>
        )}
      </header>
      {requirements.length === 0
        ? <p className="empty">This project has no requirements yet.</p>
        : <RequirementRows requirements={requirements} label="Requirements" />}
    </section>
  );
}
