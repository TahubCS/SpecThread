"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { fieldError, parseProject, projectNameError } from "@/lib/projects";

export type ProjectFormState = { name: string; error: string | null };

const FAILED = "The project could not be created. Please try again.";

/**
 * Creates a personal project owned by the signed-in user, then returns to the project list.
 * Returns the submitted name with a message when the name is rejected or the API call fails.
 */
export async function createProject(_previous: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const invalid = projectNameError(name);
  if (invalid) return { name, error: invalid };

  try {
    const response = await apiFetch("/projects", { method: "POST", body: JSON.stringify({ name }) });
    if (response.status === 400) return { name, error: fieldError(await response.json(), "name") ?? FAILED };
    if (!response.ok) throw new Error(`Create project returned ${response.status}.`);
    parseProject(await response.json());
  } catch (error) {
    console.error("Create project failed", error);
    return { name, error: FAILED };
  }
  revalidatePath("/projects");
  redirect("/projects");
}
