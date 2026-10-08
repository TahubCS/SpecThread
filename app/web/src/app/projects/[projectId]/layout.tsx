import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProjectTabs } from "@/components/project-tabs";
import { requireProject } from "@/lib/project-data";

export async function generateMetadata({ params }: LayoutProps<"/projects/[projectId]">): Promise<Metadata> {
  return { title: (await requireProject((await params).projectId)).name };
}

/**
 * Frames every page of one project with its breadcrumb and section tabs. Unknown projects and
 * projects the user does not belong to show the not-found page before any section renders.
 */
export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const project = await requireProject((await params).projectId);
  return (
    <>
      <header className="app-topbar">
        <nav className="app-breadcrumb" aria-label="Breadcrumb">
          <Link href="/projects">Projects</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <Link href={`/projects/${project.id}`} className="app-breadcrumb-current">{project.name}</Link>
          {project.archivedAt && <span className="badge">Archived</span>}
        </nav>
      </header>
      <ProjectTabs projectId={project.id} />
      {children}
    </>
  );
}
