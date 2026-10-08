"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { parseTeam, parseTeamMembers } from "@/lib/team-types";
import { requireTeamSession } from "@/lib/teams";

export type TeamActionState = { errors: Record<string, string[]>; message?: string; success?: boolean };
export type TeamSettingsState = TeamActionState & { values: { name: string; description: string } };

/** Every mutation revalidates the session; C# rechecks the current membership and role. */
async function mutate(teamId: string, suffix: string, method: "PATCH" | "POST" | "DELETE", body?: object): Promise<TeamActionState> {
  await requireTeamSession(`/teams/${encodeURIComponent(teamId)}`);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(teamId))
    return { errors: {}, message: "This team is unavailable." };
  let response: Response;
  try { response = await apiFetch(`/teams/${teamId}${suffix}`, { method, body: body ? JSON.stringify(body) : undefined }); }
  catch { return { errors: {}, message: "We couldn’t confirm the change. Refresh before trying again." }; }
  if (response.status === 401) redirect("/login");
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    const errors: Record<string, string[]> = {};
    let detail: string | undefined;
    if (problem && typeof problem === "object") {
      if ("detail" in problem && typeof problem.detail === "string") detail = problem.detail;
      if ("errors" in problem && problem.errors && typeof problem.errors === "object") {
        for (const field of ["name", "description", "role", "userId"]) {
          const messages: unknown = (problem.errors as Record<string, unknown>)[field];
          if (Array.isArray(messages) && messages.every(message => typeof message === "string")) errors[field] = messages;
        }
      }
    }
    return { errors, message: response.status === 404 ? "This team or member is no longer available. Refresh to check." :
      detail || "The change couldn’t be saved. Try again." };
  }
  if (response.status !== 204) {
    try {
      const value: unknown = await response.json();
      if (suffix.startsWith("/members/")) parseTeamMembers([value]); else parseTeam(value);
    } catch { return { errors: {}, message: "The change may have saved. Refresh to check before retrying." }; }
  }
  revalidatePath(`/teams/${teamId}`, "layout");
  revalidatePath("/teams");
  return { errors: {}, success: true };
}

export async function saveTeamSettings(teamId: string, _previous: TeamSettingsState, form: FormData): Promise<TeamSettingsState> {
  const name = form.get("name"), description = form.get("description");
  const values = { name: typeof name === "string" ? name : "", description: typeof description === "string" ? description : "" };
  return { ...await mutate(teamId, "", "PATCH", values), values };
}

export async function saveMemberRole(teamId: string, userId: string, _previous: TeamActionState, form: FormData): Promise<TeamActionState> {
  const role = form.get("role");
  return mutate(teamId, `/members/${encodeURIComponent(userId)}`, "PATCH", { role: typeof role === "string" ? role : "" });
}

export async function removeTeamMember(teamId: string, userId: string): Promise<TeamActionState> {
  return mutate(teamId, `/members/${encodeURIComponent(userId)}`, "DELETE");
}

export async function leaveTeam(teamId: string): Promise<TeamActionState> {
  const session = await requireTeamSession(`/teams/${encodeURIComponent(teamId)}`);
  const result = await mutate(teamId, `/members/${encodeURIComponent(session.user.id)}`, "DELETE");
  if (result.success) redirect("/teams");
  return result;
}

export async function transferTeamOwnership(teamId: string, targetId: string): Promise<TeamActionState> {
  return mutate(teamId, "/ownership", "POST", { userId: targetId });
}
