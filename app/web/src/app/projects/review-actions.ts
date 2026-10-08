"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { problemDetail } from "@/lib/evidence";
import { fieldError, isUuid } from "@/lib/projects";
import { parseReview, reviewError } from "@/lib/reviews";

export type ReviewFormState = { errors: { decision?: string; note?: string; form?: string } | null; recorded: number };

/**
 * Records the signed-in member's decision on a requirement. `version` is the requirement version
 * the page showed; the API refuses the decision if the requirement has changed since, and
 * refuses the requirement's own author.
 */
export async function recordReview(
  projectId: string, requirementId: string, version: number, previous: ReviewFormState, formData: FormData,
): Promise<ReviewFormState> {
  const failed = "The decision could not be recorded. Please try again.";
  const fail = (errors: NonNullable<ReviewFormState["errors"]>): ReviewFormState => ({ errors, recorded: previous.recorded });
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const invalid = reviewError(decision, note);
  if (invalid) return fail(invalid);
  if (!isUuid(projectId) || !isUuid(requirementId) || !Number.isInteger(version)) return fail({ form: failed });

  try {
    const response = await apiFetch(`/requirements/${requirementId}/reviews`, { method: "POST", body: JSON.stringify({ decision, note, version }) });
    if (response.status === 400) {
      const problem: unknown = await response.json();
      const [decisionMessage, noteMessage] = [fieldError(problem, "decision"), fieldError(problem, "note")];
      return fail(decisionMessage || noteMessage ? { decision: decisionMessage ?? undefined, note: noteMessage ?? undefined } : { form: failed });
    }
    // 403 and 409 explain themselves: the author cannot review, the requirement changed, or something is archived.
    if (response.status === 403 || response.status === 409) return fail({ form: problemDetail(await response.json()) ?? failed });
    if (!response.ok) throw new Error(`Record review returned ${response.status}.`);
    parseReview(await response.json());
  } catch (error) {
    console.error("Record review failed", error);
    return fail({ form: failed });
  }
  revalidatePath(`/projects/${projectId}`, "layout");
  return { errors: null, recorded: previous.recorded + 1 };
}
