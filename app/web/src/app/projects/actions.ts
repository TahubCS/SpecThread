"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { fieldError, isProjectId, parseProject, projectNameError } from "@/lib/projects";

export type ProjectFormState = { name: string; error: string | null };
export type RenameState = ProjectFormState & { saved: boolean };
export type ArchiveState = { error: string | null };

const OWNER_ONLY = "Only the project owner can do this.";

/**
 * Creates a personal project owned by the signed-in user, then opens it.
 * Returns the submitted name with a message when the name is rejected or the API call fails.
 */
export async function createProject(_previous: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const failed = "The project could not be created. Please try again.";
  const name = String(formData.get("name") ?? "").trim();
  const invalid = projectNameError(name);
  if (invalid) return { name, error: invalid };

  let projectId: string;
  try {
    const response = await apiFetch("/projects", { method: "POST", body: JSON.stringify({ name }) });
    if (response.status === 400) return { name, error: fieldError(await response.json(), "name") ?? failed };
    if (!response.ok) throw new Error(`Create project returned ${response.status}.`);
    projectId = parseProject(await response.json()).id;
  } catch (error) {
    console.error("Create project failed", error);
    return { name, error: failed };
  }
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

/** Renames a project for its owner. Returns the saved name, or the submitted name with a message. */
export async function renameProject(projectId: string, _previous: RenameState, formData: FormData): Promise<RenameState> {
  const failed = "The name could not be saved. Please try again.";
  const name = String(formData.get("name") ?? "").trim();
  const invalid = projectNameError(name);
  if (invalid) return { name, error: invalid, saved: false };
  if (!isProjectId(projectId)) return { name, error: failed, saved: false };

  let saved: string;
  try {
    const response = await apiFetch(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (response.status === 400) return { name, error: fieldError(await response.json(), "name") ?? failed, saved: false };
    if (response.status === 403) return { name, error: OWNER_ONLY, saved: false };
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

/** Archives a project for its owner, then returns to the project list. Archiving cannot be undone. */
export async function archiveProject(projectId: string): Promise<ArchiveState> {
  const failed = "The project could not be archived. Please try again.";
  if (!isProjectId(projectId)) return { error: failed };
  try {
    const response = await apiFetch(`/projects/${projectId}/archive`, { method: "POST" });
    if (response.status === 403) return { error: OWNER_ONLY };
    if (!response.ok) throw new Error(`Archive project returned ${response.status}.`);
  } catch (error) {
    console.error("Archive project failed", error);
    return { error: failed };
  }
  revalidatePath("/projects");
  redirect("/projects");
}
