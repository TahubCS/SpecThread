"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { problemDetail } from "@/lib/evidence";
import { fieldError, isUuid } from "@/lib/projects";
import { parseRelease, releaseFormError } from "@/lib/releases";

export type ReleaseFormState = {
  values: { tag: string; environment: string; deployedOn: string };
  errors: { tag?: string; environment?: string; deployedOn?: string };
  error: string | null;
};
export type ReleaseActionState = { error: string | null };

const GITHUB_DOWN = "GitHub could not be reached. Try again in a moment.";
const GITHUB_NOT_SET_UP = "GitHub is not set up for this SpecThread deployment yet.";
/** Recording reads GitHub once per linked change, so it gets the longer timeout (ADR-048). */
const GITHUB_WRITE_TIMEOUT_MS = 55_000;

/**
 * Records that a published release of the project's connected repository was deployed to an
 * environment on a date (ADR-066), then opens the release. The API reads the release from GitHub
 * and compares it with every linked change in the project.
 */
export async function recordRelease(projectId: string, _previous: ReleaseFormState, formData: FormData): Promise<ReleaseFormState> {
  const failed = "The release could not be recorded. Please try again.";
  const values = {
    tag: String(formData.get("tag") ?? "").trim(),
    environment: String(formData.get("environment") ?? "").trim(),
    deployedOn: String(formData.get("deployedOn") ?? "").trim(),
  };
  const errors: ReleaseFormState["errors"] = {};
  for (const field of ["tag", "environment", "deployedOn"] as const) {
    const message = releaseFormError(field, values[field]);
    if (message) errors[field] = message;
  }
  if (Object.keys(errors).length > 0) return { values, errors, error: null };
  if (!isUuid(projectId)) return { values, errors, error: failed };

  let releaseId: string;
  try {
    const response = await apiFetch(`/projects/${projectId}/releases`, { method: "POST", body: JSON.stringify(values), timeoutMs: GITHUB_WRITE_TIMEOUT_MS });
    if (response.status === 400) {
      const problem = await response.json();
      const fieldErrors = {
        tag: fieldError(problem, "tag") ?? undefined,
        environment: fieldError(problem, "environment") ?? undefined,
        deployedOn: fieldError(problem, "deployedOn") ?? undefined,
      };
      return { values, errors: fieldErrors, error: Object.values(fieldErrors).some(Boolean) ? null : failed };
    }
    // 403 and 409 explain themselves: a read-only role, no repository, already recorded, archived,
    // too many changes, the app uninstalled, or the repository changing while GitHub was read.
    if (response.status === 403 || response.status === 409) return { values, errors, error: problemDetail(await response.json()) ?? failed };
    if (response.status === 502) return { values, errors, error: GITHUB_DOWN };
    if (response.status === 503) return { values, errors, error: GITHUB_NOT_SET_UP };
    if (!response.ok) throw new Error(`Record release returned ${response.status}.`);
    releaseId = parseRelease(await response.json()).id;
  } catch (error) {
    console.error("Record release failed", error);
    return { values, errors, error: failed };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/releases/${releaseId}`);
}

/** Compares a recorded release again with every change linked in the project now. */
export async function refreshRelease(projectId: string, releaseId: string): Promise<ReleaseActionState> {
  const failed = "The release could not be compared again. Please try again.";
  if (!isUuid(projectId) || !isUuid(releaseId)) return { error: failed };
  try {
    const response = await apiFetch(`/releases/${releaseId}/refresh`, { method: "POST", timeoutMs: GITHUB_WRITE_TIMEOUT_MS });
    if (response.status === 403 || response.status === 409) return { error: problemDetail(await response.json()) ?? failed };
    if (response.status === 502) return { error: GITHUB_DOWN };
    if (response.status === 503) return { error: GITHUB_NOT_SET_UP };
    if (!response.ok) throw new Error(`Refresh release returned ${response.status}.`);
    parseRelease(await response.json());
  } catch (error) {
    console.error("Refresh release failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}
