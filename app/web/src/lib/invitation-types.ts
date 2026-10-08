export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired" | "unavailable";
export type Invitation = {
  id: string; teamId: string; email: string; role: "admin" | "member"; inviterName: string;
  createdAt: string; issuedAt: string; expiresAt: string; status: InvitationStatus;
};
export type InvitationPreview = { teamId: string; teamName: string; inviterName: string; email: string; role: "admin" | "member"; expiresAt: string; status: InvitationStatus };
export type IssuedInvitation = { invitation: Invitation; token: string; teamName: string };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export const invitationTokenPattern = /^[\da-f]{64}$/i;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid invitation response.");
  return value as Record<string, unknown>;
}
function shared(value: Record<string, unknown>) {
  if (typeof value.teamId !== "string" || !uuid.test(value.teamId) || typeof value.email !== "string" || !value.email ||
      typeof value.inviterName !== "string" || typeof value.role !== "string" || !["admin", "member"].includes(value.role) ||
      typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)) ||
      typeof value.status !== "string" || !["pending", "accepted", "revoked", "expired", "unavailable"].includes(value.status))
    throw new Error("Invalid invitation response.");
}
export function parseInvitation(value: unknown): Invitation {
  const item = object(value); shared(item);
  if (typeof item.id !== "string" || !uuid.test(item.id) ||
      typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) ||
      typeof item.issuedAt !== "string" || !Number.isFinite(Date.parse(item.issuedAt))) throw new Error("Invalid invitation response.");
  return item as Invitation;
}
export function parseInvitations(value: unknown): Invitation[] {
  if (!Array.isArray(value)) throw new Error("Invalid invitations response.");
  return value.map(parseInvitation);
}
export function parseInvitationPreview(value: unknown): InvitationPreview {
  const item = object(value); shared(item);
  if (typeof item.teamName !== "string" || !item.teamName) throw new Error("Invalid invitation response.");
  return item as InvitationPreview;
}
export function parseIssuedInvitation(value: unknown): IssuedInvitation {
  const item = object(value);
  const invitation = parseInvitation(item.invitation);
  if (typeof item.token !== "string" || !invitationTokenPattern.test(item.token) ||
      typeof item.teamName !== "string" || !item.teamName || invitation.status !== "pending") throw new Error("Invalid issued invitation response.");
  return { invitation, token: item.token, teamName: item.teamName };
}
