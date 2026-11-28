import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listMembers, listProjectAudit, requireProject } from "@/lib/project-data";
import { formatDateTime } from "@/lib/projects";
import { auditAreaText, auditEntryText } from "@/lib/requirement-events";

export const metadata: Metadata = { title: "Project audit trail" };

const MAX_ENTRIES = 200;

/**
 * The project's audit trail (ADR-065, US-21): its newest changes across requirements, evidence
 * links, decisions, follow-ups, and comments, newest first, each with who made it and when in
 * UTC. Every member reads it; nobody can change or remove an entry. Comment text is not shown.
 */
export default async function Page({ params }: PageProps<"/projects/[projectId]/audit">) {
  const { projectId } = await params;
  const project = await requireProject(projectId);
  const [entries, members] = await Promise.all([listProjectAudit(project.id), listMembers(project.id)]);
  const people = Object.fromEntries(members.map(member => [member.userId, member.name]));
  const nameOf = (userId: string) => people[userId] ?? "a former member";

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={`/projects/${project.id}`}><ArrowLeft size={15} aria-hidden="true" /> {project.name}</Link>
      <header className="project-page-heading">
        <h1 id="page-title">Project audit trail</h1>
      </header>
      <p className="requirement-meta">
        Every change is recorded with who made it and when. Entries can&apos;t be edited or removed. Times are in UTC.
      </p>
      <section className="requirement-section" aria-labelledby="audit-heading">
        <h2 id="audit-heading">Newest first</h2>
        {entries === null
          ? <p className="notice" role="status">The audit trail can&apos;t be shown right now. Try again in a few minutes.</p>
          : entries.length === 0
          ? <p className="muted">Nothing has been recorded in this project yet.</p>
          : (
            <>
              <ol className="audit-list" aria-label="Audit trail">
                {entries.map(entry => (
                  <li key={`${entry.area}-${entry.id}`}>
                    <span className="badge">{auditAreaText[entry.area]}</span>
                    <div className="audit-body">
                      <p className="audit-text">
                        <Link href={`/projects/${project.id}/requirements/${entry.requirementId}/history`}>{entry.requirementTitle}</Link>
                        {": "}{auditEntryText(entry)}
                      </p>
                      <p className="audit-meta">
                        By {nameOf(entry.actor)} · <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              {entries.length >= MAX_ENTRIES && (
                <p className="muted audit-note">
                  Showing the newest {MAX_ENTRIES} changes. Each requirement&apos;s History page lists all of its own.
                </p>
              )}
            </>
          )}
      </section>
    </article>
  );
}
