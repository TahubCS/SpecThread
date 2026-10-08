"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { evidenceReferenceError, parseEvidence, parseEvidenceList, problemDetail } from "@/lib/evidence";
import { fieldError, isUuid } from "@/lib/projects";

export type EvidenceLinkState = { reference: string; error: string | null; linked: number };
export type EvidenceActionState = { error: string | null };

const GITHUB_DOWN = "GitHub could not be reached. Try again in a moment.";
const GITHUB_NOT_SET_UP = "GitHub is not set up for this SpecThread deployment yet.";

const refresh = (projectId: string, requirementId: string) =>
  revalidatePath(`/projects/${projectId}/requirements/${requirementId}`);

/**
 * Links an issue or pull request of the project's connected repository to a requirement.
 * The API reads it from GitHub first, so only items that exist there can be linked.
 */
export async function linkEvidence(
  projectId: string, requirementId: string, previous: EvidenceLinkState, formData: FormData,
): Promise<EvidenceLinkState> {
  const failed = "The link could not be added. Please try again.";
  const reference = String(formData.get("reference") ?? "").trim();
  const fail = (error: string): EvidenceLinkState => ({ reference, error, linked: previous.linked });
  const invalid = evidenceReferenceError(reference);
  if (invalid) return fail(invalid);
  if (!isUuid(projectId) || !isUuid(requirementId)) return fail(failed);

  try {
    const response = await apiFetch(`/requirements/${requirementId}/evidence`, { method: "POST", body: JSON.stringify({ reference }) });
    if (response.status === 400) return fail(fieldError(await response.json(), "reference") ?? failed);
    // 409 explains itself: no repository, already linked, archived, the limit, or the app uninstalled.
    if (response.status === 409) return fail(problemDetail(await response.json()) ?? failed);
    if (response.status === 502) return fail(GITHUB_DOWN);
    if (response.status === 503) return fail(GITHUB_NOT_SET_UP);
    if (!response.ok) throw new Error(`Link evidence returned ${response.status}.`);
    parseEvidence(await response.json());
  } catch (error) {
    console.error("Link evidence failed", error);
    return fail(failed);
  }
  refresh(projectId, requirementId);
  return { reference: "", error: null, linked: previous.linked + 1 };
}

/** Reads every linked item from GitHub again and stores what it reports now. */
export async function refreshEvidence(projectId: string, requirementId: string): Promise<EvidenceActionState> {
  const failed = "The evidence could not be refreshed. Please try again.";
  if (!isUuid(projectId) || !isUuid(requirementId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/evidence/refresh`, { method: "POST" });
    if (response.status === 409) return { error: problemDetail(await response.json()) ?? failed };
    if (response.status === 502) return { error: GITHUB_DOWN };
    if (response.status === 503) return { error: GITHUB_NOT_SET_UP };
    if (!response.ok) throw new Error(`Refresh evidence returned ${response.status}.`);
    parseEvidenceList(await response.json());
  } catch (error) {
    console.error("Refresh evidence failed", error);
    return { error: failed };
  }
  refresh(projectId, requirementId);
  return { error: null };
}

/** Removes one link from a requirement. The issue or pull request on GitHub is not touched. */
export async function unlinkEvidence(
  projectId: string, requirementId: string, _previous: EvidenceActionState, formData: FormData,
): Promise<EvidenceActionState> {
  const failed = "The link could not be removed. Please try again.";
  const evidenceId = String(formData.get("evidenceId") ?? "");
  if (!isUuid(projectId) || !isUuid(requirementId) || !isUuid(evidenceId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/evidence/${evidenceId}`, { method: "DELETE" });
    if (response.status === 409) return { error: problemDetail(await response.json()) ?? failed };
    // Already removed by someone else: the page reload below shows the current list.
    if (!response.ok && response.status !== 404) throw new Error(`Unlink evidence returned ${response.status}.`);
  } catch (error) {
    console.error("Unlink evidence failed", error);
    return { error: failed };
  }
  refresh(projectId, requirementId);
  return { error: null };
}
