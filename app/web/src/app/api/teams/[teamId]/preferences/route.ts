import { apiFetch } from "@/lib/api";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { parseTeam } from "@/lib/team-types";

/** Same-origin preference writes; C# selects the caller's own membership. */
export async function PATCH(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  if (!await auth.api.getSession({ headers: await headers() })) return new Response(null, { status: 401 });
  const { teamId } = await params;
  if (!/^[\da-f-]{36}$/i.test(teamId)) return new Response(null, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return new Response(null, { status: 400 });
  const prefs = body as Record<string, unknown>;
  for (const field of ["isFavorite", "isExpanded"]) {
    if (field in prefs && typeof prefs[field] !== "boolean") return new Response(null, { status: 400 });
  }
  try {
    const response = await apiFetch(`/teams/${teamId}/preferences`, {
      method: "PATCH", body: JSON.stringify({ isFavorite: prefs.isFavorite, isExpanded: prefs.isExpanded }),
    });
    if (!response.ok) return new Response(null, { status: response.status });
    return Response.json(parseTeam(await response.json()), { headers: { "cache-control": "private, no-store" } });
  } catch { return new Response(null, { status: 503 }); }
}
