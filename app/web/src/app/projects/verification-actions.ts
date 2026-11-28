"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { problemDetail } from "@/lib/evidence";
import { fieldError, isUuid } from "@/lib/projects";
import { parseVerificationRun, parseVerificationRuns, parseVerificationSettings, VERIFICATION_WORKFLOW_PATTERN } from "@/lib/verification";

export type VerificationSettingsState = {
  values: { workflow: string; branch: string }; errors: { workflow?: string; branch?: string }; error: string | null; saved: boolean;
};
export type VerificationActionState = { error: string | null };

const GITHUB_DOWN = "GitHub could not be reached. Try again in a moment.";
const GITHUB_NOT_SET_UP = "GitHub is not set up for this SpecThread deployment yet.";
const GITHUB_TIMEOUT_MS = 55_000;

/** Saves the project's predefined verification once GitHub confirms the workflow exists (ADR-070). */
export async function saveVerificationSettings(
  projectId: string, _previous: VerificationSettingsState, formData: FormData,
): Promise<VerificationSettingsState> {
  const failed = "The verification could not be saved. Please try again.";
  const values = { workflow: String(formData.get("workflow") ?? "").trim(), branch: String(formData.get("branch") ?? "").trim() };
  const errors: VerificationSettingsState["errors"] = {};
  if (!values.workflow) errors.workflow = "Enter the workflow's file name.";
  else if (!VERIFICATION_WORKFLOW_PATTERN.test(values.workflow)) {
    errors.workflow = "Enter the workflow's file name in .github/workflows, such as specthread-verification.yml.";
  }
  if (!values.branch) errors.branch = "Enter the branch the workflow runs on.";
  else if (/\s/.test(values.branch)) errors.branch = "A branch name has no spaces.";
  if (errors.workflow || errors.branch) return { values, errors, error: null, saved: false };
  if (!isUuid(projectId)) return { values, errors, error: failed, saved: false };
  try {
    const response = await apiFetch(`/projects/${projectId}/verification`, { method: "PUT", body: JSON.stringify(values), timeoutMs: GITHUB_TIMEOUT_MS });
    if (response.status === 400) {
      const problem = await response.json();
      const fieldErrors = { workflow: fieldError(problem, "workflow") ?? undefined, branch: fieldError(problem, "branch") ?? undefined };
      return { values, errors: fieldErrors, error: fieldErrors.workflow || fieldErrors.branch ? null : failed, saved: false };
    }
    if (response.status === 403 || response.status === 409) return { values, errors, error: problemDetail(await response.json()) ?? failed, saved: false };
    if (response.status === 502) return { values, errors, error: GITHUB_DOWN, saved: false };
    if (response.status === 503) return { values, errors, error: GITHUB_NOT_SET_UP, saved: false };
    if (!response.ok) throw new Error(`Save verification returned ${response.status}.`);
    parseVerificationSettings(await response.json());
  } catch (error) {
    console.error("Save verification failed", error);
    return { values, errors, error: failed, saved: false };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return { values, errors: {}, error: null, saved: true };
}

/** Removes the project's predefined verification; runs already recorded stay. */
export async function removeVerificationSettings(projectId: string): Promise<VerificationActionState> {
  const failed = "The verification could not be removed. Please try again.";
  if (!isUuid(projectId)) return { error: failed };
  try {
    const response = await apiFetch(`/projects/${projectId}/verification`, { method: "DELETE" });
    if (response.status === 403 || response.status === 409) return { error: problemDetail(await response.json()) ?? failed };
    if (response.status !== 204) throw new Error(`Remove verification returned ${response.status}.`);
  } catch (error) {
    console.error("Remove verification failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

/** Starts the predefined verification for a requirement on GitHub Actions (ADR-070). */
export async function startVerificationRun(projectId: string, requirementId: string): Promise<VerificationActionState> {
  const failed = "The verification could not be started. Please try again.";
  if (!isUuid(projectId) || !isUuid(requirementId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/verification-runs`, { method: "POST", timeoutMs: GITHUB_TIMEOUT_MS });
    // 409 explains itself, and a run GitHub refused is kept as "Not started", so the page refreshes either way.
    if (response.status === 403 || response.status === 409) {
      const detail = problemDetail(await response.json()) ?? failed;
      revalidatePath(`/projects/${projectId}/requirements/${requirementId}`);
      return { error: detail };
    }
    if (response.status === 502) { revalidatePath(`/projects/${projectId}/requirements/${requirementId}`); return { error: GITHUB_DOWN }; }
    if (response.status === 503) return { error: GITHUB_NOT_SET_UP };
    if (!response.ok) throw new Error(`Start verification returned ${response.status}.`);
    parseVerificationRun(await response.json());
  } catch (error) {
    console.error("Start verification failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}/requirements/${requirementId}`);
  return { error: null };
}

/** Reads a requirement's unfinished verification runs from GitHub again. */
export async function refreshVerificationRuns(projectId: string, requirementId: string): Promise<VerificationActionState> {
  const failed = "The verification runs could not be read from GitHub. Please try again.";
  if (!isUuid(projectId) || !isUuid(requirementId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/verification-runs/refresh`, { method: "POST", timeoutMs: GITHUB_TIMEOUT_MS });
    if (response.status === 403 || response.status === 409) return { error: problemDetail(await response.json()) ?? failed };
    if (response.status === 502) return { error: GITHUB_DOWN };
    if (response.status === 503) return { error: GITHUB_NOT_SET_UP };
    if (!response.ok) throw new Error(`Refresh verification returned ${response.status}.`);
    parseVerificationRuns(await response.json());
  } catch (error) {
    console.error("Refresh verification failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}/requirements/${requirementId}`);
  return { error: null };
}
