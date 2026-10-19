import { apiFetch } from "@/lib/api";
import { parseDocument } from "@/lib/documents";
import { isUuid } from "@/lib/projects";

const passedHeaders = ["content-type", "content-disposition", "content-length"];
const notFound = () => new Response("Document not found.", { status: 404 });

/**
 * Streams a document from the API to a signed-in member of its team (the page proxy requires a
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
    if (!file.ok || !file.body) throw new Error(`GET /documents content returned ${file.status}.`);
    const headers = new Headers({ "cache-control": "private, no-store" });
    for (const name of passedHeaders) {
      const value = file.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(file.body, { headers });
  } catch (error) {
    console.error("Download document failed", error);
    return new Response("The document could not be downloaded. Please try again.", { status: 502 });
  }
}
