import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArrowLeft, Plus } from "lucide-react";
import { RequirementRows } from "@/components/requirement-rows";
import { listMilestones, listRequirements, requireProject } from "@/lib/project-data";
import { requirementCounts } from "@/lib/projects";

export const metadata: Metadata = { title: "Requirements" };

/**
 * Lists a project's active requirements, oldest first, as the API returns them. With
 * `?archived=true` it lists the archived ones instead, each still opening read-only (ADR-050).
 * With `?milestone=` it lists only that milestone or sprint, and the counts above the list say
 * how many of them are Evidence complete and how many are Accepted (ADR-053).
 */
export default async function Page({ params, searchParams }: PageProps<"/projects/[projectId]/requirements">) {
  const { projectId } = await params;
  const query = await searchParams;
  const archived = query.archived === "true";
  const milestone = typeof query.milestone === "string" ? query.milestone.trim() : "";
  const [project, requirements, milestones] = await Promise.all([
    requireProject(projectId), listRequirements(projectId, archived, milestone), listMilestones(projectId),
  ]);
  const base = `/projects/${project.id}/requirements`;
  const counts = requirementCounts(requirements);
  // A label used only on archived requirements is not offered, but stays selected when it is in the address.
  const options = milestone && !milestones.includes(milestone) ? [...milestones, milestone] : milestones;
  const archivedHref = `${base}?${new URLSearchParams({ archived: "true", ...(milestone ? { milestone } : {}) })}`;

  return (
    <section className="project-page" aria-labelledby="page-title">
      {archived && <Link className="back-link" href={base}><ArrowLeft size={15} aria-hidden="true" /> Requirements</Link>}
      <header className="project-page-heading">
        <h1 id="page-title">{archived ? "Archived requirements" : "Requirements"}</h1>
        <span className="count">{requirements.length}</span>
        {!archived && (
          <Link className="button secondary" href={archivedHref}><Archive size={15} aria-hidden="true" /> Archived</Link>
        )}
        {!archived && !project.archivedAt && (
          <Link className="button" href={`${base}/new`}><Plus size={16} aria-hidden="true" /> New requirement</Link>
        )}
      </header>
      {options.length > 0 && (
        <form className="requirement-filter" action={base} method="get" aria-label="Filter requirements">
          {archived && <input type="hidden" name="archived" value="true" />}
          <label htmlFor="milestone-filter">Milestone or sprint</label>
          <select id="milestone-filter" name="milestone" defaultValue={milestone}>
            <option value="">All requirements</option>
            {options.map(label => <option key={label} value={label}>{label}</option>)}
          </select>
          <button className="button secondary" type="submit">Filter</button>
        </form>
      )}
      {requirements.length > 0 && (
        <p className="requirement-counts" aria-label="Requirement counts">
          {milestone && <><strong>{milestone}</strong> · </>}
          {counts.total === 1 ? "1 requirement" : `${counts.total} requirements`} · {counts.evidenceComplete} Evidence complete · {counts.accepted} Accepted
        </p>
      )}
      {requirements.length === 0
        ? <p className="empty">{
          milestone ? `${archived ? "No archived requirements" : "No requirements"} in ${milestone}.`
            : archived ? "This project has no archived requirements." : "This project has no requirements yet."
        }</p>
        : <RequirementRows requirements={requirements} label={archived ? "Archived requirements" : "Requirements"} />}
    </section>
  );
}
