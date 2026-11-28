/** A linked change a release was found to include. `label` is "#9" or a short SHA. */
export type ReleaseChange = { evidenceId: string; kind: "commit" | "pull_request"; label: string; title: string };

/** A requirement a release includes, with the linked changes that put it there. */
export type ReleaseRequirement = { id: string; title: string; archivedAt: string | null; changes: ReleaseChange[] };

/**
 * A release recorded as deployed to an environment (ADR-066, docs/API.md): GitHub's tag, name,
 * commit, link, author, and publish date; the environment and calendar date it was deployed;
 * who recorded it and when; and the requirements whose linked changes its history includes, as
 * compared at `comparedAt` (`compared` changes in all).
 */
export type ProjectRelease = {
  id: string; projectId: string; tag: string; name: string; url: string; sha: string; author: string | null; prerelease: boolean;
  publishedAt: string; environment: string; deployedOn: string; recordedBy: string; recordedAt: string; comparedAt: string;
  compared: number; requirements: ReleaseRequirement[];
};

export const RELEASE_TAG_MAX = 255;
export const RELEASE_ENVIRONMENT_MAX = 50;
/** Offered in the environment field; any other name up to 50 characters is accepted. */
export const SUGGESTED_ENVIRONMENTS = ["Production", "Staging", "Test"] as const;

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isDate(value);
const isGitHubLink = (value: unknown): value is string => typeof value === "string" && value.startsWith("https://github.com/");

function fail(): never {
  throw new Error("The API returned an unexpected release.");
}

function parseRequirement(value: unknown): ReleaseRequirement {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.title !== "string" ||
      (item.archivedAt !== null && !isDate(item.archivedAt)) || !Array.isArray(item.changes)) fail();
  return {
    id: item.id, title: item.title, archivedAt: item.archivedAt,
    changes: item.changes.map((entry: unknown) => {
      const change = entry as Record<string, unknown> | null;
      if (typeof change !== "object" || change === null || typeof change.evidenceId !== "string" ||
          (change.kind !== "commit" && change.kind !== "pull_request") || typeof change.label !== "string" || typeof change.title !== "string") fail();
      return { evidenceId: change.evidenceId, kind: change.kind, label: change.label, title: change.title };
    }),
  };
}

/** Validates one release from an API response. Throws when the shape is not the documented one. */
export function parseRelease(value: unknown): ProjectRelease {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.projectId !== "string" ||
      typeof item.tag !== "string" || !item.tag || typeof item.name !== "string" || !isGitHubLink(item.url) ||
      typeof item.sha !== "string" || !/^[0-9a-f]{40}$/.test(item.sha) || (item.author !== null && typeof item.author !== "string") ||
      typeof item.prerelease !== "boolean" || !isDate(item.publishedAt) || typeof item.environment !== "string" || !item.environment ||
      !isDay(item.deployedOn) || typeof item.recordedBy !== "string" || !isDate(item.recordedAt) || !isDate(item.comparedAt) ||
      typeof item.compared !== "number" || !Number.isInteger(item.compared) || item.compared < 0 || !Array.isArray(item.requirements)) fail();
  return {
    id: item.id, projectId: item.projectId, tag: item.tag, name: item.name, url: item.url, sha: item.sha, author: item.author,
    prerelease: item.prerelease, publishedAt: item.publishedAt, environment: item.environment, deployedOn: item.deployedOn,
    recordedBy: item.recordedBy, recordedAt: item.recordedAt, comparedAt: item.comparedAt, compared: item.compared,
    requirements: item.requirements.map(parseRequirement),
  };
}

/** Validates a project's release list from an API response. Throws when it is not an array of releases. */
export function parseReleases(value: unknown): ProjectRelease[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected release list.");
  return value.map(parseRelease);
}

/** The releases that include a requirement, newest deployment first, as the API lists them. */
export function releasesIncluding(requirementId: string, releases: ProjectRelease[]): ProjectRelease[] {
  return releases.filter(release => release.requirements.some(requirement => requirement.id === requirementId));
}

const day = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** Formats a deployment's calendar date, such as "Sep 26, 2026". The date has no time, so no time zone shifts it. */
export function formatDeployedOn(value: string): string {
  return day.format(new Date(`${value}T00:00:00Z`));
}

/** Says how many requirements a release includes, such as "Includes 2 requirements". */
export function includedText(release: Pick<ProjectRelease, "requirements">): string {
  const count = release.requirements.length;
  return count === 0 ? "Includes no requirements" : count === 1 ? "Includes 1 requirement" : `Includes ${count} requirements`;
}

/** Returns the message for a release form field, or null when the API should judge it. */
export function releaseFormError(field: "tag" | "environment" | "deployedOn", value: string): string | null {
  if (!value) {
    return field === "tag" ? "Enter the release's tag as it appears on GitHub."
      : field === "environment" ? "Enter the environment it was deployed to." : "Enter the date the release was deployed.";
  }
  if (field === "tag" && value.length > RELEASE_TAG_MAX) return `Use ${RELEASE_TAG_MAX} characters or fewer.`;
  if (field === "tag" && /\s/.test(value)) return "A tag has no spaces. Enter it as it appears on GitHub.";
  if (field === "environment" && value.length > RELEASE_ENVIRONMENT_MAX) return `Use ${RELEASE_ENVIRONMENT_MAX} characters or fewer.`;
  if (field === "deployedOn" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter the date as YYYY-MM-DD.";
  return null;
}
