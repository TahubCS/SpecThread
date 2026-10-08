"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { parseIssuedInvitation, type IssuedInvitation } from "@/lib/invitation-types";
import { requireTeamSession } from "@/lib/teams";
import { readAuthConfig } from "@/lib/auth-config";
import { createEmailSender, teamInvitationEmail } from "@/lib/email";

export type InvitationActionState = {
  errors: Record<string, string[]>; message?: string; success?: boolean; url?: string; deliveryFailed?: boolean;
  values?: { email: string; role: string };
};

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

async function issue(teamId: string, suffix: string, body?: object): Promise<InvitationActionState> {
  await requireTeamSession(`/teams/${encodeURIComponent(teamId)}/members`);
  if (!uuid.test(teamId)) return { errors: {}, message: "This team is unavailable." };
  let response: Response;
  try { response = await apiFetch(`/teams/${teamId}/invitations${suffix}`, { method: "POST", body: body ? JSON.stringify(body) : undefined }); }
  catch { return { errors: {}, message: "We couldn’t confirm the invitation. Check invitations before trying again." }; }
  if (response.status === 401) redirect("/login");
  if (!response.ok) return invitationProblem(response);
  let issued: IssuedInvitation;
  try { issued = parseIssuedInvitation(await response.json()); }
  catch { return { errors: {}, message: "The invitation may have been created. Check invitations before retrying." }; }
  if (issued.invitation.teamId !== teamId) return { errors: {}, message: "The invitation couldn’t be confirmed." };
  const config = readAuthConfig(process.env);
  const url = `${config.baseURL}/invites/${issued.token}`;
  let deliveryFailed = false;
  try {
    await createEmailSender(config.email)(teamInvitationEmail({ to: issued.invitation.email, url, teamName: issued.teamName,
      inviterName: issued.invitation.inviterName, role: issued.invitation.role, expiresAt: issued.invitation.expiresAt }));
  } catch { deliveryFailed = true; }
  revalidatePath(`/teams/${teamId}`, "layout");
  return { errors: {}, success: true, url, deliveryFailed, message: deliveryFailed ?
    "Invitation created, but the email couldn’t be sent. Copy the link or resend from Invitations." : "Invitation email sent. You can also copy the link." };
}
async function invitationProblem(response: Response): Promise<InvitationActionState> {
  const value: unknown = await response.json().catch(() => null);
  const errors: Record<string, string[]> = {};
  let detail: string | undefined;
  if (value && typeof value === "object") {
    if ("detail" in value && typeof value.detail === "string") detail = value.detail;
    if ("errors" in value && value.errors && typeof value.errors === "object") {
      for (const field of ["email", "role"]) {
        const messages: unknown = (value.errors as Record<string, unknown>)[field];
        if (Array.isArray(messages) && messages.every(message => typeof message === "string")) errors[field] = messages;
      }
    }
  }
  return { errors, message: response.status === 404 ? "This team or invitation is no longer available." : detail || "The invitation couldn’t be saved. Try again." };
}
export async function createInvitation(teamId: string, _previous: InvitationActionState, form: FormData): Promise<InvitationActionState> {
  const email = form.get("email"), role = form.get("role");
  const values = { email: typeof email === "string" ? email : "", role: typeof role === "string" ? role : "member" };
  return { ...await issue(teamId, "", values), values };
}
export async function resendInvitation(teamId: string, invitationId: string): Promise<InvitationActionState> {
  if (!uuid.test(invitationId)) return { errors: {}, message: "This invitation is unavailable." };
  return issue(teamId, `/${invitationId}/resend`);
}
export async function revokeInvitation(teamId: string, invitationId: string): Promise<InvitationActionState> {
  await requireTeamSession(`/teams/${encodeURIComponent(teamId)}/invitations`);
  if (!uuid.test(teamId) || !uuid.test(invitationId)) return { errors: {}, message: "This invitation is unavailable." };
  let response: Response;
  try { response = await apiFetch(`/teams/${teamId}/invitations/${invitationId}`, { method: "DELETE" }); }
  catch { return { errors: {}, message: "We couldn’t confirm revocation. Refresh before trying again." }; }
  if (response.status === 401) redirect("/login");
  if (!response.ok) return invitationProblem(response);
  revalidatePath(`/teams/${teamId}`, "layout");
  return { errors: {}, success: true };
}
