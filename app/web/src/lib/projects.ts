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
