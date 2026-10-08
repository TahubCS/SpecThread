import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { parseProjects } from "@/lib/projects";

export const metadata: Metadata = { title: "Projects" };

const createdDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** Lists the signed-in user's active projects from the API. A failed request reaches the error page. */
export default async function Page() {
  const response = await apiFetch("/projects");
  if (!response.ok) throw new Error(`List projects returned ${response.status}.`);
  const projects = parseProjects(await response.json());

  return (
    <section className="scaffold-page" aria-labelledby="page-title">
      <header className="scaffold-heading">
        <p className="scaffold-kicker">SpecThread / Workspace</p>
        <h1 id="page-title">Projects</h1>
        <p>Projects you own or belong to.</p>
      </header>
      <div className="project-toolbar">
        <p className="muted">{projects.length === 1 ? "1 project" : `${projects.length} projects`}</p>
        <Link className="button" href="/projects/new">New project</Link>
      </div>
      {projects.length === 0 ? (
        <p className="notice">You have no projects yet. Create one to start adding requirements.</p>
      ) : (
        <ul className="project-list" aria-label="Your projects">
          {projects.map(project => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}`}>
                <span>{project.name}</span>
                <time dateTime={project.createdAt}>Created {createdDate.format(new Date(project.createdAt))}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
