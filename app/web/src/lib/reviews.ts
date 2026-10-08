export const DECISIONS = ["accepted", "rejected", "more_evidence"] as const;
export type Decision = (typeof DECISIONS)[number];

/** How each decision is named on screen. "Accepted" means a person approved the requirement, nothing more. */
export const decisionText: Record<Decision, string> = {
  accepted: "Accepted", rejected: "Rejected", more_evidence: "More evidence requested",
};

export const REVIEW_NOTE_MAX = 2_000;

/** One evidence link as it was when a decision was made. */
export type ReviewedEvidence = { id: string; kind: string; label: string; title: string; state: string | null };

/** A person's decision on a requirement (docs/API.md). `evidence` is what was linked at that moment. */
export type Review = {
  id: string; requirementId: string; decision: Decision; note: string; requirementVersion: number;
  evidence: ReviewedEvidence[]; decidedBy: string; decidedAt: string;
};

/** The latest decision on a requirement, as lists show it. */
export type ReviewSummary = { decision: Decision; decidedBy: string; decidedAt: string; outdated: boolean };

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isDecision = (value: unknown): value is Decision => DECISIONS.includes(value as Decision);

/** Validates one decision from an API response. Throws when the shape is not the documented one. */
export function parseReview(value: unknown): Review {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.requirementId !== "string" ||
      !isDecision(item.decision) || typeof item.note !== "string" || typeof item.requirementVersion !== "number" ||
      !Number.isInteger(item.requirementVersion) || item.requirementVersion < 1 || !Array.isArray(item.evidence) ||
      typeof item.decidedBy !== "string" || !isDate(item.decidedAt)) {
    throw new Error("The API returned an unexpected review.");
  }
  return {
    id: item.id, requirementId: item.requirementId, decision: item.decision, note: item.note,
    requirementVersion: item.requirementVersion, decidedBy: item.decidedBy, decidedAt: item.decidedAt,
    evidence: item.evidence.map((entry: unknown) => {
      const link = entry as Record<string, unknown> | null;
      if (typeof link !== "object" || link === null || typeof link.id !== "string" || typeof link.kind !== "string" ||
          typeof link.label !== "string" || typeof link.title !== "string" || (link.state !== null && typeof link.state !== "string")) {
        throw new Error("The API returned an unexpected review.");
      }
      return { id: link.id, kind: link.kind, label: link.label, title: link.title, state: link.state };
    }),
  };
}

/** Validates a list of decisions from an API response. Throws when it is not an array of decisions. */
export function parseReviews(value: unknown): Review[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected review list.");
  return value.map(parseReview);
}

/** Validates the latest-decision field of a listed requirement. Null means it has not been reviewed. */
export function parseReviewSummary(value: unknown): ReviewSummary | null {
  if (value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item !== "object" || !isDecision(item.decision) || typeof item.decidedBy !== "string" || !isDate(item.decidedAt) ||
      typeof item.outdated !== "boolean") {
    throw new Error("The API returned an unexpected review.");
  }
  return { decision: item.decision, decidedBy: item.decidedBy, decidedAt: item.decidedAt, outdated: item.outdated };
}

/** Returns the message for a decision that cannot be sent as it is, or null. Rejecting or asking for more needs a reason. */
export function reviewError(decision: string, note: string): { decision?: string; note?: string } | null {
  if (!isDecision(decision)) return { decision: "Choose accept, reject, or request more evidence." };
  if (note.length > REVIEW_NOTE_MAX) return { note: `Use ${REVIEW_NOTE_MAX.toLocaleString("en")} characters or fewer.` };
  if (decision !== "accepted" && !note) return { note: "Say what is missing or wrong, so the team knows what to do next." };
  return null;
}

/**
 * Reports why a decision no longer describes the requirement: it was edited since, or its
 * evidence links are not the ones reviewed. Reading the same links again from GitHub changes neither.
 */
export function reviewOutdated(review: Pick<Review, "requirementVersion" | "evidence">, version: number, evidenceIds: string[]): { version: boolean; evidence: boolean } {
  const reviewed = new Set(review.evidence.map(link => link.id));
  return {
    version: review.requirementVersion !== version,
    evidence: reviewed.size !== evidenceIds.length || evidenceIds.some(id => !reviewed.has(id)),
  };
}

/** Describes what a decision looked at, such as "Reviewed version 3 with 5 evidence links". */
export function reviewedText(review: Pick<Review, "requirementVersion" | "evidence">): string {
  const count = review.evidence.length;
  return `Reviewed version ${review.requirementVersion} with ${count === 0 ? "no evidence links" : count === 1 ? "1 evidence link" : `${count} evidence links`}`;
}
