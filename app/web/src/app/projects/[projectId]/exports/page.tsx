import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { listMilestones, requireProject } from "@/lib/project-data";

export const metadata: Metadata = { title: "Export" };

/**
 * Exports a project's active requirements, or one milestone's, as a PDF to send to someone who
 * won't sign in (ADR-068, US-22): each requirement's title, acceptance criteria, evidence status,
 * and latest decision with reviewer and date, with links back to SpecThread. Every member,
 * Observers included, can export.
 */
export default async function Page({ params, searchParams }: PageProps<"/projects/[projectId]/exports">) {
  const { projectId } = await params;
  const query = await searchParams;
  const selected = typeof query.milestone === "string" ? query.milestone.trim() : "";
  const [project, milestones] = await Promise.all([requireProject(projectId), listMilestones(projectId)]);
  const options = selected && !milestones.includes(selected) ? [...milestones, selected] : milestones;

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={`/projects/${project.id}/requirements`}><ArrowLeft size={15} aria-hidden="true" /> Requirements</Link>
      <header className="project-page-heading">
        <h1 id="page-title">Export as PDF</h1>
      </header>
      <p className="requirement-meta">
        A PDF lists each active requirement&apos;s title, acceptance criteria, evidence status, and latest decision with the reviewer and
        date. Each title links back to SpecThread, so someone who receives it can open the evidence when they sign in.
      </p>
      <form className="export-form" action={`/projects/${project.id}/exports/pdf`} method="get" aria-label="Export requirements">
        <div className="field">
          <label htmlFor="export-milestone">Requirements to include</label>
          <select id="export-milestone" name="milestone" defaultValue={selected}>
            <option value="">All active requirements</option>
            {options.map(label => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>
        <div className="form-actions">
          <button className="button" type="submit"><Download size={15} aria-hidden="true" /> Download PDF</button>
        </div>
      </form>
    </article>
  );
}
