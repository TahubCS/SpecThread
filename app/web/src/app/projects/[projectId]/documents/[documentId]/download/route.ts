import { apiFetch } from "@/lib/api";
import { parseDocument } from "@/lib/documents";
import { isUuid } from "@/lib/projects";

const passedHeaders = ["content-type", "content-disposition"];
const notFound = () => new Response("Document not found.", { status: 404 });

/**
 * Sends a document from the API to a signed-in member of its team (the page proxy requires a
 * session). A document opened under another project's address is not found, like its page.
 * The API's attachment disposition is kept, so the file never renders inside the app's origin.
 */
export async function GET(_request: Request, { params }: RouteContext<"/projects/[projectId]/documents/[documentId]/download">) {
  const { projectId, documentId } = await params;
  if (!isUuid(projectId) || !isUuid(documentId)) return notFound();
  try {
    const metadata = await apiFetch(`/documents/${documentId}`);
    if (metadata.status === 404) return notFound();
    if (!metadata.ok) throw new Error(`GET /documents returned ${metadata.status}.`);
    if (parseDocument(await metadata.json()).projectId !== projectId) return notFound();

    const file = await apiFetch(`/documents/${documentId}/content`);
    if (file.status === 404) return notFound();
    if (!file.ok) throw new Error(`GET /documents content returned ${file.status}.`);
    // Read the whole file (at most 4 MiB) here, while apiFetch's timeout still applies, so a
    // stalled or broken transfer becomes the 502 below instead of a truncated download.
    const bytes = await file.arrayBuffer();
    const headers = new Headers({ "cache-control": "private, no-store", "content-length": String(bytes.byteLength) });
    for (const name of passedHeaders) {
      const value = file.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(bytes, { headers });
  } catch (error) {
    console.error("Download document failed", error);
    return new Response("The document could not be downloaded. Please try again.", { status: 502 });
  }
}
