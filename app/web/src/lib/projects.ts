import { isAccepted, isVersion, parseReviewSummary, type ReviewSummary } from "./reviews";

/**
 * A project as returned by the SpecThread API (docs/API.md). It belongs to a team; `teamRole`
 * is the signed-in user's role there, and `ownerUserId` is who created the project.
 */
export type Project = {
  id: string; name: string; ownerUserId: string; createdAt: string; archivedAt: string | null;
  teamId: string; teamName: string; teamRole: "owner" | "admin" | "member";
};

/** Reports whether the signed-in user may rename or archive the project or change its repository: the team's Owner and Admins. */
export function canManageProject(project: Pick<Project, "teamRole">): boolean {
  return project.teamRole !== "member";
}

export const PROJECT_NAME_MAX = 200;

/** Validates one project from an API response. Throws when the shape is not the documented one. */
export function parseProject(value: unknown): Project {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.name !== "string" ||
      typeof item.ownerUserId !== "string" || typeof item.createdAt !== "string" || Number.isNaN(Date.parse(item.createdAt)) ||
      (item.archivedAt !== null && typeof item.archivedAt !== "string") || typeof item.teamId !== "string" ||
      typeof item.teamName !== "string" || (item.teamRole !== "owner" && item.teamRole !== "admin" && item.teamRole !== "member")) {
    throw new Error("The API returned an unexpected project.");
  }
  return {
    id: item.id, name: item.name, ownerUserId: item.ownerUserId, createdAt: item.createdAt, archivedAt: item.archivedAt,
    teamId: item.teamId, teamName: item.teamName, teamRole: item.teamRole,
  };
}

/** Validates a project list from an API response. Throws when it is not an array of projects. */
export function parseProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected project list.");
  return value.map(parseProject);
}

/** Returns the message to show for a trimmed project name, or null when the name is acceptable. */
export function projectNameError(name: string): string | null {
  if (!name) return "Enter a project name.";
  if (name.length > PROJECT_NAME_MAX) return `Use ${PROJECT_NAME_MAX} characters or fewer.`;
  return null;
}

/** Reads the first message for `field` from a 400 problem-details body, or null when there is none. */
export function fieldError(problem: unknown, field: string): string | null {
  const errors = (problem as { errors?: unknown } | null)?.errors;
  if (typeof errors !== "object" || errors === null) return null;
  const messages = (errors as Record<string, unknown>)[field];
  return Array.isArray(messages) && typeof messages[0] === "string" ? messages[0] : null;
}

/**
 * A requirement as listed for a project (docs/API.md). `evidenceCount` is how many evidence links
 * it has; `review` is its latest decision, or null. `milestone` is its milestone or sprint label
 * (ADR-053), and `criteriaVersion` its current acceptance-criteria version (ADR-051).
 * `evidenceComplete` is whether its evidence meets the team's Evidence complete rule, and
 * `evidenceMissing` lists the parts of that rule it does not meet (ADR-056).
 */
export type RequirementSummary = {
  id: string; projectId: string; title: string; version: number;
  createdAt: string; updatedAt: string; archivedAt: string | null; evidenceCount: number; review: ReviewSummary | null;
  milestone: string | null; criteriaVersion: number | null; evidenceComplete: boolean; evidenceMissing: EvidencePart[];
};

/**
 * The parts of the Evidence complete rule, in the order the API lists missing ones (ADR-056): a
 * linked issue; a merged pull request; passing checks on each merged pull request's final commit;
 * and a linked release that includes each merged pull request.
 */
export const EVIDENCE_PARTS = ["issue", "merged_pull_request", "passing_checks", "release"] as const;
export type EvidencePart = typeof EVIDENCE_PARTS[number];

/** What each part of the Evidence complete rule asks for, as shown on a requirement page. */
export const EVIDENCE_PART_TEXT: Record<EvidencePart, string> = {
  issue: "A linked issue",
  merged_pull_request: "A merged pull request",
  passing_checks: "Checks passed on the final commit of each merged pull request",
  release: "A linked release that includes each merged pull request",
};

/** Short names for missing parts in a requirement row. */
export const EVIDENCE_PART_SHORT: Record<EvidencePart, string> = {
  issue: "issue", merged_pull_request: "merged pull request", passing_checks: "passing checks", release: "release",
};

/**
 * Reads `evidenceComplete` and `evidenceMissing` from an API response, or undefined when either
 * has the wrong shape. The previous API (ADR-044) may send neither, or no `evidenceMissing`: that
 * reads as not complete and nothing listed, so no part is claimed missing under the old rule.
 */
export function parseEvidenceStatus(item: Record<string, unknown> | null): { evidenceComplete: boolean; evidenceMissing: EvidencePart[] } | undefined {
  if (item?.evidenceMissing === undefined) {
    return item?.evidenceComplete === undefined || typeof item.evidenceComplete === "boolean"
      ? { evidenceComplete: false, evidenceMissing: [] } : undefined;
  }
  const missing = item.evidenceMissing;
  if (typeof item.evidenceComplete !== "boolean" || !Array.isArray(missing) ||
      !missing.every(part => (EVIDENCE_PARTS as readonly unknown[]).includes(part)) || new Set(missing).size !== missing.length ||
      item.evidenceComplete !== (missing.length === 0)) {
    return undefined;
  }
  return { evidenceComplete: item.evidenceComplete, evidenceMissing: EVIDENCE_PARTS.filter(part => missing.includes(part)) };
}

/** A project member with the name and email other members may see (docs/API.md). */
export type ProjectMember = { userId: string; name: string; email: string; joinedAt: string; isOwner: boolean };

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/** Reports whether a route segment has the shape of a project or requirement ID, so other text never reaches an API path. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Reads a field that may be null, such as a milestone label or criteria version. A missing field,
 * as from the previous API (ADR-044), reads as null; a value of the wrong shape as undefined.
 */
export function optionalField<T>(value: unknown, valid: (value: unknown) => value is T): T | null | undefined {
  if (value === undefined || value === null) return null;
  return valid(value) ? value : undefined;
}

export const isLabel = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/**
 * Validates a requirement list from an API response. Throws when the shape is not the documented one.
 * The previous API (ADR-044) may send no `milestone`, `criteriaVersion`, `evidenceComplete`, or `evidenceMissing`.
 */
export function parseRequirementSummaries(value: unknown): RequirementSummary[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected requirement list.");
  return value.map((entry: unknown) => {
    const item = entry as Record<string, unknown> | null;
    const milestone = optionalField(item?.milestone, isLabel);
    const criteriaVersion = optionalField(item?.criteriaVersion, isVersion);
    const evidence = parseEvidenceStatus(item);
    if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.projectId !== "string" ||
        typeof item.title !== "string" || typeof item.version !== "number" || !isDate(item.createdAt) ||
        !isDate(item.updatedAt) || (item.archivedAt !== null && typeof item.archivedAt !== "string") ||
        typeof item.evidenceCount !== "number" || !Number.isInteger(item.evidenceCount) || item.evidenceCount < 0 ||
        milestone === undefined || criteriaVersion === undefined || evidence === undefined) {
      throw new Error("The API returned an unexpected requirement.");
    }
    return {
      id: item.id, projectId: item.projectId, title: item.title, version: item.version,
      createdAt: item.createdAt, updatedAt: item.updatedAt, archivedAt: item.archivedAt, evidenceCount: item.evidenceCount,
      review: parseReviewSummary(item.review), milestone, criteriaVersion, ...evidence,
    };
  });
}

/** Counts a set of listed requirements, such as one milestone, by Evidence complete and by Accepted. */
export function requirementCounts(requirements: Pick<RequirementSummary, "evidenceComplete" | "review">[]) {
  return {
    total: requirements.length,
    evidenceComplete: requirements.filter(requirement => requirement.evidenceComplete).length,
    accepted: requirements.filter(requirement => isAccepted(requirement.review)).length,
  };
}

/** Validates the milestone labels in use in a project. Throws when the shape is not the documented one. */
export function parseMilestones(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(isLabel)) throw new Error("The API returned an unexpected milestone list.");
  return value;
}

/** Validates a member list from an API response. Throws when the shape is not the documented one. */
export function parseMembers(value: unknown): ProjectMember[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected member list.");
  return value.map((entry: unknown) => {
    const item = entry as Record<string, unknown> | null;
    if (typeof item !== "object" || item === null || typeof item.userId !== "string" || typeof item.name !== "string" ||
        typeof item.email !== "string" || !isDate(item.joinedAt) || typeof item.isOwner !== "boolean") {
      throw new Error("The API returned an unexpected project member.");
    }
    return { userId: item.userId, name: item.name, email: item.email, joinedAt: item.joinedAt, isOwner: item.isOwner };
  });
}

const mediumDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** Formats an API timestamp as a short UTC date, such as "Oct 8, 2026". */
export function formatDate(value: string): string {
  return mediumDate.format(new Date(value));
}
