"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { problemDetail } from "@/lib/evidence";
import { fieldError, isUuid } from "@/lib/projects";
import {
  milestoneError, parseRequirement, readMilestoneInput, readRequirementInput, requirementErrors, requirementProblemErrors, type RequirementErrors,
} from "@/lib/requirements";

/**
 * `needsConfirmation` is set when the API refused new criteria because the latest decision
 * accepted the current ones (ADR-051), so the form asks the user to confirm before saving again.
 */
export type RequirementFormState = { errors: RequirementErrors | null; needsConfirmation?: boolean };
export type RequirementArchiveState = { error: string | null };
export type MilestoneState = { error: string | null; saved: number };

const failure = (form: string): RequirementFormState => ({ errors: { items: {}, form } });
const PROJECT_ARCHIVED = "This project is archived, so its requirements can't be changed.";

/** Creates a requirement in a project, then opens it. Returns messages when it is rejected or the API call fails. */
export async function createRequirement(projectId: string, _previous: RequirementFormState, formData: FormData): Promise<RequirementFormState> {
  const failed = "The requirement could not be created. Please try again.";
  const input = readRequirementInput(formData);
  const invalid = requirementErrors(input);
  if (invalid) return { errors: invalid };
  if (!isUuid(projectId)) return failure(failed);

  let requirementId: string;
  try {
    const response = await apiFetch(`/projects/${projectId}/requirements`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title, description: input.description, acceptanceCriteria: input.criteria, documentIds: input.documentIds,
        milestone: input.milestone || null,
      }),
    });
    if (response.status === 400) return { errors: requirementProblemErrors(await response.json(), failed) };
    if (response.status === 409) return failure(PROJECT_ARCHIVED);
    if (!response.ok) throw new Error(`Create requirement returned ${response.status}.`);
    requirementId = parseRequirement(await response.json()).id;
  } catch (error) {
    console.error("Create requirement failed", error);
    return failure(failed);
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/requirements/${requirementId}`);
}

/**
 * Saves a requirement, replacing its criteria, then opens it. `version` is the version the form
 * was loaded with; if someone else saved first the API refuses and the user is told to reload.
 * New criteria on a requirement whose current criteria were accepted are sent only with the
 * form's `confirmCriteriaChange` field, which the user sets by confirming the warning (ADR-051).
 */
export async function updateRequirement(
  projectId: string, requirementId: string, version: number, _previous: RequirementFormState, formData: FormData,
): Promise<RequirementFormState> {
  const failed = "The requirement could not be saved. Please try again.";
  const input = readRequirementInput(formData);
  const invalid = requirementErrors(input);
  if (invalid) return { errors: invalid };
  if (!isUuid(projectId) || !isUuid(requirementId) || !Number.isInteger(version)) return failure(failed);
  const confirmCriteriaChange = formData.get("confirmCriteriaChange") === "true";

  try {
    const response = await apiFetch(`/requirements/${requirementId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: input.title, description: input.description, acceptanceCriteria: input.criteria, documentIds: input.documentIds, version,
        confirmCriteriaChange,
      }),
    });
    if (response.status === 400) return { errors: requirementProblemErrors(await response.json(), failed) };
    if (response.status === 409) {
      const problem: unknown = await response.json().catch(() => null);
      if ((problem as { code?: unknown } | null)?.code === "accepted_criteria_change") return { errors: null, needsConfirmation: true };
      return failure(await conflictMessage(requirementId, version));
    }
    if (!response.ok) throw new Error(`Update requirement returned ${response.status}.`);
    parseRequirement(await response.json());
  } catch (error) {
    console.error("Update requirement failed", error);
    return failure(failed);
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/requirements/${requirementId}`);
}

/** Archives a requirement, then returns to the project's requirement list. `restoreRequirement` undoes it. */
export async function archiveRequirement(projectId: string, requirementId: string): Promise<RequirementArchiveState> {
  const failed = "The requirement could not be archived. Please try again.";
  if (!isUuid(projectId) || !isUuid(requirementId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/archive`, { method: "POST" });
    if (response.status === 409) return { error: PROJECT_ARCHIVED };
    if (!response.ok) throw new Error(`Archive requirement returned ${response.status}.`);
  } catch (error) {
    console.error("Archive requirement failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/requirements`);
}

/** Restores an archived requirement, then reopens it so it can be edited and reviewed again. */
export async function restoreRequirement(projectId: string, requirementId: string): Promise<RequirementArchiveState> {
  const failed = "The requirement could not be restored. Please try again.";
  if (!isUuid(projectId) || !isUuid(requirementId)) return { error: failed };
  try {
    const response = await apiFetch(`/requirements/${requirementId}/restore`, { method: "POST" });
    if (response.status === 409) return { error: "This project is archived, so its requirements can't be restored." };
    if (!response.ok) throw new Error(`Restore requirement returned ${response.status}.`);
  } catch (error) {
    console.error("Restore requirement failed", error);
    return { error: failed };
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  redirect(`/projects/${projectId}/requirements/${requirementId}`);
}

/**
 * Sets or clears a requirement's milestone or sprint label (ADR-053). It is not an edit: the
 * version stays, so a decision on the requirement does not become outdated.
 */
export async function setMilestone(
  projectId: string, requirementId: string, previous: MilestoneState, formData: FormData,
): Promise<MilestoneState> {
  const failed = "The milestone could not be saved. Please try again.";
  const fail = (error: string): MilestoneState => ({ error, saved: previous.saved });
  const milestone = readMilestoneInput(formData);
  if (milestone === null) return fail(failed);
  const invalid = milestoneError(milestone);
  if (invalid) return fail(invalid);
  if (!isUuid(projectId) || !isUuid(requirementId)) return fail(failed);
  try {
    const response = await apiFetch(`/requirements/${requirementId}/milestone`, {
      method: "PUT", body: JSON.stringify({ milestone: milestone || null }),
    });
    if (response.status === 400) return fail(fieldError(await response.json(), "milestone") ?? failed);
    if (response.status === 409) return fail(problemDetail(await response.json()) ?? failed);
    if (!response.ok) throw new Error(`Set milestone returned ${response.status}.`);
  } catch (error) {
    console.error("Set milestone failed", error);
    return fail(failed);
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, saved: previous.saved + 1 };
}

/** Explains a refused save by looking at the requirement as it is now: archived, or changed by someone else. */
async function conflictMessage(requirementId: string, version: number): Promise<string> {
  const response = await apiFetch(`/requirements/${requirementId}`);
  if (!response.ok) throw new Error(`Reading the requirement after a conflict returned ${response.status}.`);
  const current = parseRequirement(await response.json());
  if (current.archivedAt) return "This requirement is archived and can no longer be changed.";
  if (current.version !== version) {
    return "Someone else saved this requirement while you were editing. Reload the page to see their changes, then make yours again.";
  }
  return PROJECT_ARCHIVED;
}
