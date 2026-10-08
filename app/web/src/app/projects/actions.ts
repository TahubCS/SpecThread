"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { problemDetail } from "@/lib/evidence";
import { fieldError, isUuid, parseProject, projectNameError } from "@/lib/projects";

export type ProjectFormState = { name: string; teamId: string; error: string | null; teamError?: string };
export type RenameState = { name: string; error: string | null; saved: boolean };
export type ArchiveState = { error: string | null };

const MANAGERS_ONLY = "Only the team Owner or an Admin can do this.";

/**
 * Creates a project in the chosen team, then opens it. Only the team's Owner and Admins may.
 * Returns what was submitted with a message when a field is rejected or the API call fails.
 */
export async function createProject(_previous: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const failed = "The project could not be created. Please try again.";
  const name = String(formData.get("name") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "");
  const invalid = projectNameError(name);
  if (invalid) return { name, teamId, error: invalid };
  if (!isUuid(teamId)) return { name, teamId, error: null, teamError: "Choose a team." };

  let projectId: string;
  try {
    const response = await apiFetch("/projects", { method: "POST", body: JSON.stringify({ name, teamId }) });
    if (response.status === 400) {
      const problem: unknown = await response.json();
      const [nameError, teamError] = [fieldError(problem, "name"), fieldError(problem, "teamId")];
      return nameError || teamError ? { name, teamId, error: nameError, teamError: teamError ?? undefined } : { name, teamId, error: failed };
    }
    // 403 is either the team rule or an account the API does not know; only the first is about the team.
    if (response.status === 403 && problemDetail(await response.json()) === MANAGERS_ONLY) {
      return { name, teamId, error: null, teamError: "Only the team Owner or an Admin can create a project in this team." };
    }
    if (response.status === 404) return { name, teamId, error: null, teamError: "That team could not be found. Choose another." };
    if (!response.ok) throw new Error(`Create project returned ${response.status}.`);
    projectId = parseProject(await response.json()).id;
  } catch (error) {
    console.error("Create project failed", error);
    return { name, teamId, error: failed };
  }
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

/** Renames a project for its team's Owner or an Admin. Returns the saved name, or the submitted name with a message. */
export async function renameProject(projectId: string, _previous: RenameState, formData: FormData): Promise<RenameState> {
  const failed = "The name could not be saved. Please try again.";
  const name = String(formData.get("name") ?? "").trim();
  const invalid = projectNameError(name);
  if (invalid) return { name, error: invalid, saved: false };
  if (!isUuid(projectId)) return { name, error: failed, saved: false };

  let saved: string;
  try {
    const response = await apiFetch(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (response.status === 400) return { name, error: fieldError(await response.json(), "name") ?? failed, saved: false };
    if (response.status === 403) return { name, error: MANAGERS_ONLY, saved: false };
    if (response.status === 409) return { name, error: "This project is archived and can't be renamed.", saved: false };
    if (!response.ok) throw new Error(`Rename project returned ${response.status}.`);
    saved = parseProject(await response.json()).name;
  } catch (error) {
    console.error("Rename project failed", error);
    return { name, error: failed, saved: false };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  return { name: saved, error: null, saved: true };
}

/** Archives a project for its team's Owner or an Admin, then returns to the project list. Archiving cannot be undone. */
export async function archiveProject(projectId: string): Promise<ArchiveState> {
  const failed = "The project could not be archived. Please try again.";
  if (!isUuid(projectId)) return { error: failed };
  try {
    const response = await apiFetch(`/projects/${projectId}/archive`, { method: "POST" });
    if (response.status === 403) return { error: MANAGERS_ONLY };
    if (!response.ok) throw new Error(`Archive project returned ${response.status}.`);
  } catch (error) {
    console.error("Archive project failed", error);
    return { error: failed };
  }
  revalidatePath("/projects");
  redirect("/projects");
}
