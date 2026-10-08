/** A project as returned by the SpecThread API (docs/API.md). */
export type Project = { id: string; name: string; ownerUserId: string; createdAt: string; archivedAt: string | null };

export const PROJECT_NAME_MAX = 200;

/** Validates one project from an API response. Throws when the shape is not the documented one. */
export function parseProject(value: unknown): Project {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.name !== "string" ||
      typeof item.ownerUserId !== "string" || typeof item.createdAt !== "string" || Number.isNaN(Date.parse(item.createdAt)) ||
      (item.archivedAt !== null && typeof item.archivedAt !== "string")) {
    throw new Error("The API returned an unexpected project.");
  }
  return { id: item.id, name: item.name, ownerUserId: item.ownerUserId, createdAt: item.createdAt, archivedAt: item.archivedAt };
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

/** A requirement as listed for a project (docs/API.md). */
export type RequirementSummary = {
  id: string; projectId: string; title: string; version: number;
  createdAt: string; updatedAt: string; archivedAt: string | null;
};

/** A project member with the name and email other members may see (docs/API.md). */
export type ProjectMember = { userId: string; name: string; email: string; joinedAt: string; isOwner: boolean };

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/** Reports whether a route segment has the shape of a project or requirement ID, so other text never reaches an API path. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Validates a requirement list from an API response. Throws when the shape is not the documented one. */
export function parseRequirementSummaries(value: unknown): RequirementSummary[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected requirement list.");
  return value.map((entry: unknown) => {
    const item = entry as Record<string, unknown> | null;
    if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.projectId !== "string" ||
        typeof item.title !== "string" || typeof item.version !== "number" || !isDate(item.createdAt) ||
        !isDate(item.updatedAt) || (item.archivedAt !== null && typeof item.archivedAt !== "string")) {
      throw new Error("The API returned an unexpected requirement.");
    }
    return {
      id: item.id, projectId: item.projectId, title: item.title, version: item.version,
      createdAt: item.createdAt, updatedAt: item.updatedAt, archivedAt: item.archivedAt,
    };
  });
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
