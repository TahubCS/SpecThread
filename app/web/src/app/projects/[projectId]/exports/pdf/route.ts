import { apiFetch } from "@/lib/api";
import { readAuthConfig } from "@/lib/auth-config";
import { isUuid } from "@/lib/projects";
import { buildExportPdf, exportFileName, parseProjectExport } from "@/lib/project-export";

const notFound = () => new Response("Project not found.", { status: 404 });

/**
 * Sends a project's requirements, or one milestone's, as a PDF (ADR-068, US-22) to a signed-in
 * member of its team (the page proxy requires a session). Links in the PDF point back to
 * SpecThread's configured address (BETTER_AUTH_URL), as invitation links do, never to whatever
 * host the request named. The file is an attachment and is never cached.
 */
export async function GET(request: Request, { params }: RouteContext<"/projects/[projectId]/exports/pdf">) {
  const { projectId } = await params;
  if (!isUuid(projectId)) return notFound();
  const milestone = new URL(request.url).searchParams.get("milestone")?.trim() ?? "";
  try {
    const response = await apiFetch(`/projects/${projectId}/export${milestone ? `?${new URLSearchParams({ milestone })}` : ""}`);
    if (response.status === 404) return notFound();
    if (!response.ok) throw new Error(`GET /projects/:id/export returned ${response.status}.`);
    const data = parseProjectExport(await response.json());
    if (data.projectId !== projectId) return notFound();
    const bytes = await buildExportPdf(data, readAuthConfig(process.env).baseURL);
    const name = exportFileName(data);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}"`,
        "content-length": String(bytes.byteLength),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Export project failed", error);
    return new Response("The export could not be made. Please try again.", { status: 502 });
  }
}
