import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProjectSettings } from "@/components/project-settings";
import { getProjectRepository } from "@/lib/github-data";
import { requireProject, viewerId } from "@/lib/project-data";

export const metadata: Metadata = { title: "Settings" };

/** Lets the owner rename or archive the project. Other members and archived projects see why they cannot. */
export default async function Page({ params }: PageProps<"/projects/[projectId]/settings">) {
  const project = await requireProject((await params).projectId);
  const [viewer, repository] = await Promise.all([viewerId(), getProjectRepository(project.id)]);
  const isOwner = project.ownerUserId === viewer;

  return (
    <section className="project-page is-narrow" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Settings</h1>
      </header>
      <Link className="settings-link" href={`/projects/${project.id}/settings/repository`}>
        <span>
          <strong>GitHub repository</strong>
          <span>{repository ? repository.fullName : "Not connected"}</span>
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
      {project.archivedAt
        ? <p className="notice">This project is archived and can no longer be changed.</p>
        : isOwner
          ? <ProjectSettings projectId={project.id} name={project.name} />
          : <p className="notice">Only the project owner can rename or archive this project.</p>}
    </section>
  );
}
