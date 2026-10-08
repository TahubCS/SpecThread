"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { gitHubAccess } from "@/lib/github-data";
import { fieldError, isUuid } from "@/lib/projects";
import { parseProjectRepository, parseRepositoryChoice } from "@/lib/repositories";

export type RepositoryActionState = { error: string | null };

const OWNER_ONLY = "Only the project owner can do this.";
const ARCHIVED = "This project is archived, so its repository can't be changed.";
const SIGN_IN_AGAIN = "GitHub did not accept your GitHub sign-in. Sign in with GitHub again from your account page, then retry.";

/**
 * Connects the chosen GitHub repository to a project for its owner. The API asks GitHub
 * whether this user can reach the repository before saving, so the choice is never trusted.
 */
export async function connectRepository(projectId: string, _previous: RepositoryActionState, formData: FormData): Promise<RepositoryActionState> {
  const failed = "The repository could not be connected. Please try again.";
  const choice = parseRepositoryChoice(formData.get("repository"));
  if (!choice) return { error: "Choose a repository." };
  if (!isUuid(projectId)) return { error: failed };

  try {
    const access = await gitHubAccess();
    if (access.token === null) return { error: access.reason === "not-linked" ? "Link your GitHub account first." : SIGN_IN_AGAIN };

    const response = await apiFetch(`/projects/${projectId}/repository`, {
      method: "PUT", body: JSON.stringify({ ...choice, githubToken: access.token }),
    });
    if (response.status === 400) {
      const problem: unknown = await response.json();
      return { error: fieldError(problem, "repositoryId") ?? fieldError(problem, "installationId") ?? fieldError(problem, "githubToken") ?? failed };
    }
    if (response.status === 403) return { error: OWNER_ONLY };
    if (response.status === 409) return { error: ARCHIVED };
    if (response.status === 502) return { error: "GitHub could not be reached. Try again in a moment." };
    if (response.status === 503) return { error: "GitHub is not set up for this SpecThread deployment yet." };
    if (!response.ok) throw new Error(`Connect repository returned ${response.status}.`);
    if (!parseProjectRepository(await response.json())) throw new Error("Connect repository returned no repository.");
  } catch (error) {
    console.error("Connect repository failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/settings/repository`);
}

/** Disconnects a project's repository for its owner. Evidence already recorded is not removed. */
export async function disconnectRepository(projectId: string): Promise<RepositoryActionState> {
  const failed = "The repository could not be disconnected. Please try again.";
  if (!isUuid(projectId)) return { error: failed };
  try {
    const response = await apiFetch(`/projects/${projectId}/repository`, { method: "DELETE" });
    if (response.status === 403) return { error: OWNER_ONLY };
    if (response.status === 409) return { error: ARCHIVED };
    if (!response.ok) throw new Error(`Disconnect repository returned ${response.status}.`);
  } catch (error) {
    console.error("Disconnect repository failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/settings/repository`);
}
