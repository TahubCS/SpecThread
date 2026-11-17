import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Box, ChevronRight } from "lucide-react";
import { formatDate, groupProjectsByTeam, parseProjects } from "@/lib/projects";
import { teamRoleLabels } from "@/lib/team-types";

export const metadata: Metadata = { title: "Projects" };

/**
 * Lists the active projects of every team the signed-in user belongs to, grouped by team. Each
 * team's heading opens that team's own project list. A failed request reaches the error page.
 */
export default async function Page() {
  const response = await apiFetch("/projects");
  if (!response.ok) throw new Error(`List projects returned ${response.status}.`);
  const projects = parseProjects(await response.json());
  const groups = groupProjectsByTeam(projects);

  return (
    <section className="scaffold-page" aria-labelledby="page-title">
      <header className="scaffold-heading has-action">
        <div>
          <h1 id="page-title">Projects</h1>
          <p>Projects in your teams, grouped by team.</p>
        </div>
        <Link className="button" href="/projects/new">New project</Link>
      </header>
      {projects.length === 0 ? (
        <p className="notice">Your teams have no projects yet. Create one to start adding requirements.</p>
      ) : (
        <>
          <p className="project-count">
            {projects.length === 1 ? "1 project" : `${projects.length} projects`}
            {groups.length > 1 && ` in ${groups.length} teams`}
          </p>
          {groups.map(group => (
            <section key={group.teamId} className="project-group" aria-labelledby={`team-${group.teamId}`}>
              <header className="project-group-heading">
                <h2 id={`team-${group.teamId}`}>{group.teamName}</h2>
                <span className="badge">{teamRoleLabels[group.teamRole]}</span>
                <Link className="project-group-link" href={`/teams/${group.teamId}/projects`}
                  aria-label={`Open ${group.teamName}`}>
                  Open team <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </header>
              <ul className="row-list" aria-label={`${group.teamName} projects`}>
                {group.projects.map(project => (
                  <li key={project.id}>
                    <Link className="row" href={`/projects/${project.id}`}>
                      <Box size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span className="row-title">{project.name}</span>
                      <time className="row-meta" dateTime={project.createdAt}>Created {formatDate(project.createdAt)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
