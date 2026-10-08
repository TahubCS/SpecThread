import "server-only";
import { notFound, redirect } from "next/navigation";
import { apiFetch } from "./api";
import { apiBaseUrl } from "./api-config";
import { getTeam } from "./teams";
import { invitationTokenPattern, parseInvitationPreview, parseInvitations } from "./invitation-types";

export async function getTeamInvitations(teamId: string) {
  const team = await getTeam(teamId);
  if (team.role === "member") notFound();
  const response = await apiFetch(`/teams/${teamId}/invitations`);
  if (response.status === 401) redirect("/login");
  if (response.status === 403 || response.status === 404) notFound();
  if (!response.ok) throw new Error("Invitations could not be loaded.");
  const invitations = parseInvitations(await response.json());
  if (invitations.some(invitation => invitation.teamId !== teamId)) throw new Error("Invalid invitation scope.");
  return invitations;
}

/** This one API read is public by contract; tokens grant preview, never membership. */
export async function getInvitationPreview(token: string) {
  if (!invitationTokenPattern.test(token)) return null;
  const response = await fetch(new URL(`/invites/${token}`, apiBaseUrl(process.env.SPECTHREAD_API_URL)), { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("The invitation could not be loaded.");
  return parseInvitationPreview(await response.json());
}
