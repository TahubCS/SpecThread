import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArrowLeft, Plus } from "lucide-react";
import { RequirementRows } from "@/components/requirement-rows";
import { listRequirements, requireProject } from "@/lib/project-data";

export const metadata: Metadata = { title: "Requirements" };

/**
 * Lists a project's active requirements, oldest first, as the API returns them. With
 * `?archived=true` it lists the archived ones instead, each still opening read-only (ADR-050).
 */
export default async function Page({ params, searchParams }: PageProps<"/projects/[projectId]/requirements">) {
  const { projectId } = await params;
  const archived = (await searchParams).archived === "true";
  const [project, requirements] = await Promise.all([requireProject(projectId), listRequirements(projectId, archived)]);
  const base = `/projects/${project.id}/requirements`;

  return (
    <section className="project-page" aria-labelledby="page-title">
      {archived && <Link className="back-link" href={base}><ArrowLeft size={15} aria-hidden="true" /> Requirements</Link>}
      <header className="project-page-heading">
        <h1 id="page-title">{archived ? "Archived requirements" : "Requirements"}</h1>
        <span className="count">{requirements.length}</span>
        {!archived && (
          <Link className="button secondary" href={`${base}?archived=true`}><Archive size={15} aria-hidden="true" /> Archived</Link>
        )}
        {!archived && !project.archivedAt && (
          <Link className="button" href={`${base}/new`}><Plus size={16} aria-hidden="true" /> New requirement</Link>
        )}
      </header>
      {requirements.length === 0
        ? <p className="empty">{archived ? "This project has no archived requirements." : "This project has no requirements yet."}</p>
        : <RequirementRows requirements={requirements} label={archived ? "Archived requirements" : "Requirements"} />}
    </section>
  );
}
