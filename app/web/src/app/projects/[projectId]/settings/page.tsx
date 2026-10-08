import type { Metadata } from "next";
import { ProjectSettings } from "@/components/project-settings";
import { requireProject, viewerId } from "@/lib/project-data";

export const metadata: Metadata = { title: "Settings" };

/** Lets the owner rename or archive the project. Other members and archived projects see why they cannot. */
export default async function Page({ params }: PageProps<"/projects/[projectId]/settings">) {
  const project = await requireProject((await params).projectId);
  const isOwner = project.ownerUserId === await viewerId();

  return (
    <section className="project-page is-narrow" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Settings</h1>
      </header>
      {project.archivedAt
        ? <p className="notice">This project is archived and can no longer be changed.</p>
        : isOwner
          ? <ProjectSettings projectId={project.id} name={project.name} />
          : <p className="notice">Only the project owner can rename or archive this project.</p>}
    </section>
  );
}
