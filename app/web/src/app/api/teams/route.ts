import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { parseTeams } from "@/lib/team-types";

/** Sidebar reads stay on this origin; C# enforces membership authorization. */
export async function GET() {
  try {
    if (!await auth.api.getSession({ headers: await headers() })) {
      return Response.json({ message: "Sign in to view your teams." }, { status: 401 });
    }
    const response = await apiFetch("/teams");
    if (response.status === 401) return new Response(null, { status: 401 });
    if (!response.ok) throw new Error("Team lookup failed.");
    return Response.json(parseTeams(await response.json()), { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ message: "Teams could not be loaded. Try again." }, { status: 503 });
  }
}
