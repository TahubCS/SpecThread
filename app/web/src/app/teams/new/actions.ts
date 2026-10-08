"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { requireTeamSession } from "@/lib/teams";
import { parseTeam } from "@/lib/team-types";

export type CreateTeamState = {
  values: { name: string; description: string };
  errors: { name?: string[]; description?: string[] };
  message?: string;
};

/** Sends creation to C#; the API owns field validation and ownership. */
export async function createTeam(_previous: CreateTeamState, formData: FormData): Promise<CreateTeamState> {
  return submitTeam(formData, false);
}

export async function finishOnboarding(_previous: CreateTeamState, formData: FormData): Promise<CreateTeamState> {
  return submitTeam(formData, true);
}

async function submitTeam(formData: FormData, initial: boolean): Promise<CreateTeamState> {
  await requireTeamSession(initial ? "/onboarding" : "/teams/new");
  const name = formData.get("name"), description = formData.get("description");
  const values = { name: typeof name === "string" ? name : "", description: typeof description === "string" ? description : "" };
  let response: Response;
  try { response = await apiFetch(initial ? "/onboarding" : "/teams", { method: "POST", body: JSON.stringify(values) }); }
  catch { return { values, errors: {}, message: "We couldn’t confirm team creation. Check again before retrying." }; }
  if (response.status === 401) redirect(initial ? "/login?next=%2Fonboarding" : "/login?next=%2Fteams%2Fnew");
  if (initial && response.status === 409) redirect("/teams");
  if (response.status === 400) {
    const problem: unknown = await response.json().catch(() => null);
    const errors: CreateTeamState["errors"] = {};
    if (problem && typeof problem === "object" && "errors" in problem && problem.errors && typeof problem.errors === "object") {
      for (const field of ["name", "description"] as const) {
        const messages: unknown = (problem.errors as Record<string, unknown>)[field];
        if (Array.isArray(messages) && messages.every(message => typeof message === "string")) errors[field] = messages;
      }
    }
    return { values, errors, message: "Check the team details and try again." };
  }
  if (!response.ok) return { values, errors: {}, message: "We couldn’t create your team. Try again." };
  let id: string;
  try { id = parseTeam(await response.json()).id; }
  catch { return { values, errors: {}, message: "Your team may have been created. Check Teams before trying again." }; }
  redirect(`/teams/${id}`);
}
