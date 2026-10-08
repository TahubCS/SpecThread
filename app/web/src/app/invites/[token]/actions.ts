"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { invitationTokenPattern } from "@/lib/invitation-types";
import { parseTeam } from "@/lib/team-types";
import { requireTeamSession } from "@/lib/teams";

export type AcceptanceState = { message?: string };
export async function acceptInvitation(token: string): Promise<AcceptanceState> {
  if (!invitationTokenPattern.test(token)) return { message: "This invitation is unavailable. Ask for a fresh link." };
  await requireTeamSession(`/invites/${token}`);
  let response: Response;
  try { response = await apiFetch(`/invites/${token}/accept`, { method: "POST" }); }
  catch { return { message: "We couldn’t confirm acceptance. Try again; accepting twice won’t add you twice." }; }
  if (response.status === 401) redirect(`/login?next=${encodeURIComponent(`/invites/${token}`)}`);
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    return { message: problem && typeof problem === "object" && "detail" in problem && typeof problem.detail === "string" ? problem.detail :
      "This invitation is unavailable. Ask a team Owner or Admin for a fresh link." };
  }
  let team;
  try { team = parseTeam(await response.json()); }
  catch { return { message: "Your invitation may have been accepted. Refresh to check." }; }
  revalidatePath("/teams", "layout");
  redirect(`/teams/${team.id}`);
}
