import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { DocumentArchive } from "@/components/document-archive";
import { documentTypeLabel, formatFileSize } from "@/lib/documents";
import { requireDocument, requireProject } from "@/lib/project-data";
import { formatDate } from "@/lib/projects";

type Props = PageProps<"/projects/[projectId]/documents/[documentId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId, documentId } = await params;
  return { title: (await requireDocument(projectId, documentId)).title };
}

/** Shows a document's details with its download link, and the archive action while it can change. */
export default async function Page({ params }: Props) {
  const { projectId, documentId } = await params;
  const [project, document] = await Promise.all([requireProject(projectId), requireDocument(projectId, documentId)]);
  const editable = !project.archivedAt && !document.archivedAt;
  const base = `/projects/${project.id}/documents`;

  return (
    <article className="project-page is-form" aria-labelledby="page-title">
      <Link className="back-link" href={base}><ArrowLeft size={15} aria-hidden="true" /> Documentation</Link>
      <header className="project-page-heading">
        <h1 id="page-title">{document.title}</h1>
        {document.archivedAt && <span className="badge">Archived</span>}
        {/* A plain link: the route answers with a file download, not a page. */}
        <a className="button" href={`${base}/${document.id}/download`} download>
          <Download size={16} aria-hidden="true" /> Download
        </a>
      </header>
      {document.archivedAt && (
        <p className="notice">This document was archived on {formatDate(document.archivedAt)}. It can still be downloaded.</p>
      )}
      <dl className="details document-details">
        <dt>File</dt>
        <dd>{document.fileName}</dd>
        <dt>Type</dt>
        <dd>{documentTypeLabel(document.contentType)}</dd>
        <dt>Size</dt>
        <dd>{formatFileSize(document.sizeBytes)}</dd>
        <dt>Uploaded</dt>
        <dd><time dateTime={document.uploadedAt}>{formatDate(document.uploadedAt)}</time> by {document.uploadedByName}</dd>
      </dl>
      {editable && <DocumentArchive projectId={project.id} documentId={document.id} />}
    </article>
  );
}
