import Link from "next/link";
import { Box } from "lucide-react";
import { RequirementRows } from "@/components/requirement-rows";
import { getProjectRepository } from "@/lib/github-data";
import { listMembers, listRequirements, requireProject } from "@/lib/project-data";
import { formatDate } from "@/lib/projects";

/** Shows a project's most recently changed requirements beside its details. */
export default async function Page({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const project = await requireProject(projectId);
  const [requirements, members, repository] = await Promise.all([
    listRequirements(projectId), listMembers(projectId), getProjectRepository(projectId),
  ]);
  const creator = members.find(member => member.userId === project.ownerUserId);
  const recent = [...requirements].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);

  return (
    <div className="project-overview">
      <div className="project-main">
        <header className="project-hero">
          <span className="project-icon" aria-hidden="true"><Box size={20} strokeWidth={1.75} /></span>
          <h1>{project.name}</h1>
        </header>
        {project.archivedAt && (
          <p className="notice">This project was archived on {formatDate(project.archivedAt)}. It can be read but not changed.</p>
        )}
        <section className="project-section" aria-labelledby="recent-requirements">
          <div className="project-section-heading">
            <h2 id="recent-requirements">Recent requirements</h2>
            {requirements.length > 0 && <Link href={`/projects/${project.id}/requirements`}>View all {requirements.length}</Link>}
          </div>
          {recent.length === 0
            ? <p className="empty">This project has no requirements yet.</p>
            : <RequirementRows requirements={recent} label="Recent requirements" />}
        </section>
      </div>
      <aside className="project-side" aria-label="Project details">
        <section className="side-card" aria-labelledby="properties-heading">
          <h2 id="properties-heading">Properties</h2>
          <dl>
            <dt>Status</dt>
            <dd><span className={`status-dot${project.archivedAt ? "" : " is-active"}`} aria-hidden="true" />{project.archivedAt ? "Archived" : "Active"}</dd>
            <dt>Team</dt>
            <dd><Link href={`/teams/${project.teamId}`}>{project.teamName}</Link></dd>
            <dt>Repository</dt>
            <dd><Link href={`/projects/${project.id}/settings/repository`}>{repository ? repository.fullName : "Not connected"}</Link></dd>
            <dt>Requirements</dt>
            <dd><Link href={`/projects/${project.id}/requirements`}>{requirements.length}</Link></dd>
            <dt>Created</dt>
            <dd><time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time></dd>
          </dl>
        </section>
        <section className="side-card" aria-labelledby="activity-heading">
          <h2 id="activity-heading">Activity</h2>
          <p className="side-activity">
            {creator ? `${creator.name} created the project` : "Project created"} · <time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time>
          </p>
        </section>
      </aside>
    </div>
  );
}
