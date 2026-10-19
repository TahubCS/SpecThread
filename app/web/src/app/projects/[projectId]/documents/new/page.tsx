import type { Metadata } from "next";
import { uploadDocument } from "@/app/projects/document-actions";
import { DocumentUploadForm } from "@/components/document-upload-form";
import { requireProject } from "@/lib/project-data";

export const metadata: Metadata = { title: "Upload document" };

/** Renders the form that adds a document to a project. Archived projects explain why they cannot take one. */
export default async function Page({ params }: PageProps<"/projects/[projectId]/documents/new">) {
  const project = await requireProject((await params).projectId);

  return (
    <section className="project-page is-form" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Upload document</h1>
      </header>
      {project.archivedAt
        ? <p className="notice">This project is archived, so documents can&apos;t be added.</p>
        : (
          <>
            <p className="document-intro">Everyone in {project.teamName} can open and download the documents in this project.</p>
            <DocumentUploadForm action={uploadDocument.bind(null, project.id)} cancelHref={`/projects/${project.id}/documents`} />
          </>
        )}
    </section>
  );
}
