import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Upload } from "lucide-react";
import { documentTypeLabel, formatFileSize } from "@/lib/documents";
import { listDocuments, requireProject } from "@/lib/project-data";
import { formatDate } from "@/lib/projects";

export const metadata: Metadata = { title: "Documentation" };

/** Lists a project's active reference documents, newest first, each linking to its page. */
export default async function Page({ params }: PageProps<"/projects/[projectId]/documents">) {
  const { projectId } = await params;
  const [project, documents] = await Promise.all([requireProject(projectId), listDocuments(projectId)]);

  return (
    <section className="project-page" aria-labelledby="page-title">
      <header className="project-page-heading">
        <h1 id="page-title">Documentation</h1>
        <span className="count">{documents.length}</span>
        {!project.archivedAt && (
          <Link className="button" href={`/projects/${project.id}/documents/new`}><Upload size={16} aria-hidden="true" /> Upload document</Link>
        )}
      </header>
      {documents.length === 0 ? (
        <p className="empty">This project has no documents yet. Upload a PDF, DOC, or DOCX file to share it with the team.</p>
      ) : (
        <ul className="row-list" aria-label="Documents">
          {documents.map(document => (
            <li key={document.id}>
              <Link className="row" href={`/projects/${project.id}/documents/${document.id}`}>
                <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
                <span className="row-title">{document.title}</span>
                <span className="row-meta">{documentTypeLabel(document.contentType)} · {formatFileSize(document.sizeBytes)}</span>
                <time className="row-meta document-row-date" dateTime={document.uploadedAt}>Uploaded {formatDate(document.uploadedAt)}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
