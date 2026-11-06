"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import {
  EVIDENCE_SEARCH_MAX, evidenceReferenceError, parseEvidence, parseEvidenceList, parseEvidenceSearch, parseEvidenceSuggestions, problemDetail,
  type EvidenceSearchItem,
} from "@/lib/evidence";
import { fieldError, isUuid } from "@/lib/projects";

export type EvidenceLinkState = { reference: string; error: string | null; linked: number };
export type EvidenceActionState = { error: string | null };
/** `items` is null until a search has been answered. */
export type EvidenceSearchState = { query: string; items: EvidenceSearchItem[] | null; error: string | null };

const GITHUB_DOWN = "GitHub could not be reached. Try again in a moment.";
const GITHUB_NOT_SET_UP = "GitHub is not set up for this SpecThread deployment yet.";
/**
 * Linking and refreshing read GitHub, one call per linked item and per release to compare, so
 * they get longer than an ordinary API call. Keep this below the page's maxDuration (ADR-048).
 */
const GITHUB_WRITE_TIMEOUT_MS = 55_000;

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
    const response = await apiFetch(`/requirements/${requirementId}/evidence`, { method: "POST", body: JSON.stringify({ reference }), timeoutMs: GITHUB_WRITE_TIMEOUT_MS });
    if (response.status === 400) return fail(fieldError(await response.json(), "reference") ?? failed);
    // 409 explains itself: no repository, already linked, archived, the limit, the app uninstalled,
    // or the evidence changing while GitHub was read.
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

/**
 * Finds issues and pull requests of the project's connected repository by words in their titles
 * (ADR-054). Nothing is linked: each result is linked with `linkEvidence` by its number.
 */
export async function searchEvidence(
  projectId: string, requirementId: string, _previous: EvidenceSearchState, formData: FormData,
): Promise<EvidenceSearchState> {
  const failed = "GitHub could not be searched. Please try again.";
  const entry = formData.get("q");
  const query = typeof entry === "string" ? entry.trim() : "";
  const fail = (error: string): EvidenceSearchState => ({ query, items: null, error });
  if (!query) return fail("Enter words from the title of an issue or pull request.");
  if (query.length > EVIDENCE_SEARCH_MAX) return fail(`Use ${EVIDENCE_SEARCH_MAX} characters or fewer.`);
  if (!isUuid(projectId) || !isUuid(requirementId)) return fail(failed);

  try {
    const response = await apiFetch(`/requirements/${requirementId}/evidence/search?${new URLSearchParams({ q: query })}`);
    if (response.status === 400) return fail(fieldError(await response.json(), "q") ?? failed);
    if (response.status === 409) return fail(problemDetail(await response.json()) ?? failed);
    if (response.status === 502) return fail(GITHUB_DOWN);
    if (response.status === 503) return fail(GITHUB_NOT_SET_UP);
    if (!response.ok) throw new Error(`Search evidence returned ${response.status}.`);
    return { query, items: parseEvidenceSearch(await response.json()), error: null };
  } catch (error) {
    console.error("Search evidence failed", error);
    return fail(failed);
  }
}

/** Looks for pull requests that say they close the linked issues (ADR-056). What it finds is suggested, never linked. */
export async function findSuggestions(projectId: string, requirementId: string): Promise<EvidenceActionState> {
  const failed = "Suggestions could not be found. Please try again.";
  if (!isUuid(projectId) || !isUuid(requirementId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/evidence/suggestions/scan`, { method: "POST", timeoutMs: GITHUB_WRITE_TIMEOUT_MS });
    if (response.status === 409) return { error: problemDetail(await response.json()) ?? failed };
    if (response.status === 502) return { error: GITHUB_DOWN };
    if (response.status === 503) return { error: GITHUB_NOT_SET_UP };
    if (!response.ok) throw new Error(`Find suggestions returned ${response.status}.`);
    parseEvidenceSuggestions(await response.json());
  } catch (error) {
    console.error("Find suggestions failed", error);
    return { error: failed };
  }
  refresh(projectId, requirementId);
  return { error: null };
}

/** Confirms or rejects one suggestion, by the form's `suggestionId` and the button's `decision`. Both are recorded with who and when. */
export async function decideSuggestion(
  projectId: string, requirementId: string, _previous: EvidenceActionState, formData: FormData,
): Promise<EvidenceActionState> {
  const failed = "The suggestion could not be saved. Please try again.";
  const suggestionId = String(formData.get("suggestionId") ?? "");
  const decision = formData.get("decision");
  if (!isUuid(projectId) || !isUuid(requirementId) || !isUuid(suggestionId) || (decision !== "confirm" && decision !== "reject")) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/evidence/suggestions/${suggestionId}/${decision}`, {
      method: "POST", timeoutMs: GITHUB_WRITE_TIMEOUT_MS,
    });
    // 409 explains itself: decided already, linked already, gone from GitHub, the limit, or archived.
    if (response.status === 409) return { error: problemDetail(await response.json()) ?? failed };
    if (response.status === 502) return { error: GITHUB_DOWN };
    if (response.status === 503) return { error: GITHUB_NOT_SET_UP };
    if (!response.ok) throw new Error(`Decide suggestion returned ${response.status}.`);
  } catch (error) {
    console.error("Decide suggestion failed", error);
    return { error: failed };
  }
  refresh(projectId, requirementId);
  return { error: null };
}

/** Moves a link to another requirement of the project in one step (ADR-056). Both requirements' histories show it. */
export async function moveEvidence(
  projectId: string, requirementId: string, _previous: EvidenceActionState, formData: FormData,
): Promise<EvidenceActionState> {
  const failed = "The link could not be moved. Please try again.";
  const evidenceId = String(formData.get("evidenceId") ?? "");
  const targetRequirementId = String(formData.get("targetRequirementId") ?? "");
  if (!targetRequirementId) return { error: "Choose the requirement to move this link to." };
  if (!isUuid(projectId) || !isUuid(requirementId) || !isUuid(evidenceId) || !isUuid(targetRequirementId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/evidence/${evidenceId}/move`, {
      method: "POST", body: JSON.stringify({ targetRequirementId }), timeoutMs: GITHUB_WRITE_TIMEOUT_MS,
    });
    if (response.status === 400) return { error: fieldError(await response.json(), "targetRequirementId") ?? failed };
    if (response.status === 409) return { error: problemDetail(await response.json()) ?? failed };
    if (response.status === 502) return { error: GITHUB_DOWN };
    if (response.status === 503) return { error: GITHUB_NOT_SET_UP };
    if (!response.ok) throw new Error(`Move evidence returned ${response.status}.`);
    parseEvidence(await response.json());
  } catch (error) {
    console.error("Move evidence failed", error);
    return { error: failed };
  }
  // Both requirements change, along with the counts on the project's lists.
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

/** Reads every linked item from GitHub again and stores what it reports now. */
export async function refreshEvidence(projectId: string, requirementId: string): Promise<EvidenceActionState> {
  const failed = "The evidence could not be refreshed. Please try again.";
  if (!isUuid(projectId) || !isUuid(requirementId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/evidence/refresh`, { method: "POST", timeoutMs: GITHUB_WRITE_TIMEOUT_MS });
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
