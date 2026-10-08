import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Box } from "lucide-react";
import { formatDate, parseProjects } from "@/lib/projects";

export const metadata: Metadata = { title: "Projects" };

/** Lists the signed-in user's active projects from the API. A failed request reaches the error page. */
export default async function Page() {
  const response = await apiFetch("/projects");
  if (!response.ok) throw new Error(`List projects returned ${response.status}.`);
  const projects = parseProjects(await response.json());

  return (
    <section className="scaffold-page" aria-labelledby="page-title">
      <header className="scaffold-heading has-action">
        <div>
          <h1 id="page-title">Projects</h1>
          <p>Projects you own or belong to.</p>
        </div>
        <Link className="button" href="/projects/new">New project</Link>
      </header>
      {projects.length === 0 ? (
        <p className="notice">You have no projects yet. Create one to start adding requirements.</p>
      ) : (
        <>
          <p className="project-count">{projects.length === 1 ? "1 project" : `${projects.length} projects`}</p>
          <ul className="row-list" aria-label="Your projects">
            {projects.map(project => (
              <li key={project.id}>
                <Link className="row" href={`/projects/${project.id}`}>
                  <Box size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span className="row-title">{project.name}</span>
                  <time className="row-meta" dateTime={project.createdAt}>Created {formatDate(project.createdAt)}</time>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
