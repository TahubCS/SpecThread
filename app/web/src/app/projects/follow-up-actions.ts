"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { problemDetail } from "@/lib/evidence";
import { fieldError, isUuid } from "@/lib/projects";

export type FollowUpState = { error: string | null; changed: number };

/** Marks a requirement as a follow-up of another requirement in the same project (ADR-052). */
export async function addFollowUp(
  projectId: string, requirementId: string, previous: FollowUpState, formData: FormData,
): Promise<FollowUpState> {
  const failed = "The follow-up link could not be added. Please try again.";
  const originalRequirementId = String(formData.get("originalRequirementId") ?? "");
  const fail = (error: string): FollowUpState => ({ error, changed: previous.changed });
  if (!originalRequirementId) return fail("Choose the requirement this one follows up.");
  if (!isUuid(projectId) || !isUuid(requirementId) || !isUuid(originalRequirementId)) return fail(failed);
  try {
    const response = await apiFetch(`/requirements/${requirementId}/follow-ups`, {
      method: "POST", body: JSON.stringify({ originalRequirementId }),
    });
    if (response.status === 400) return fail(fieldError(await response.json(), "originalRequirementId") ?? failed);
    // 409 explains itself: already linked, or something is archived.
    if (response.status === 409) return fail(problemDetail(await response.json()) ?? failed);
    if (!response.ok) throw new Error(`Add follow-up returned ${response.status}.`);
  } catch (error) {
    console.error("Add follow-up failed", error);
    return fail(failed);
  }
  // Both requirements show the link, so every page of the project may change.
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, changed: previous.changed + 1 };
}

/** Removes a follow-up link. The change is kept in both requirements' history. */
export async function removeFollowUp(
  projectId: string, requirementId: string, previous: FollowUpState, formData: FormData,
): Promise<FollowUpState> {
  const failed = "The follow-up link could not be removed. Please try again.";
  const originalRequirementId = String(formData.get("originalRequirementId") ?? "");
  const fail = (error: string): FollowUpState => ({ error, changed: previous.changed });
  if (!isUuid(projectId) || !isUuid(requirementId) || !isUuid(originalRequirementId)) return fail(failed);
  try {
    const response = await apiFetch(`/requirements/${requirementId}/follow-ups/${originalRequirementId}`, { method: "DELETE" });
    if (response.status === 409) return fail(problemDetail(await response.json()) ?? failed);
    // Already removed, for example by someone else: show the list as it is now.
    if (!response.ok && response.status !== 404) throw new Error(`Remove follow-up returned ${response.status}.`);
  } catch (error) {
    console.error("Remove follow-up failed", error);
    return fail(failed);
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, changed: previous.changed + 1 };
}
