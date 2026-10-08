/** One commit of a pull request. `message` is the first line only. */
export type EvidenceCommit = { sha: string; message: string; author: string | null; date: string; url: string };

export const CHECK_RESULTS = ["passed", "failed", "running", "skipped", "cancelled", "neutral"] as const;

/**
 * One automated check on a commit, as GitHub reported it. `kind` is a check run or an older
 * commit status. `url` is set only when the check has a page on GitHub itself.
 */
export type EvidenceCheck = {
  name: string; result: (typeof CHECK_RESULTS)[number]; url: string | null; completedAt: string | null; kind: "check" | "status";
};

/**
 * An issue, pull request, commit, or release linked to a requirement, as GitHub reported it when
 * last read (docs/API.md). Issues and pull requests have `number` and `state`; commits have
 * `sha`; releases have `tag`, and `contains` maps the ID of each linked commit or pull request
 * that was compared to whether the release's history includes it.
 * Pull requests and commits carry what changed; pull requests also list their commits. They
 * also carry the check results of the commit (for a pull request, its latest): `checks` is null
 * when GitHub would not let them be read. `source` says whether a person added the link or
 * confirmed a suggestion; `linkedBy` is that person either way.
 */
export type Evidence = {
  id: string;
  requirementId: string;
  kind: "issue" | "pull_request" | "commit" | "release";
  number: number | null;
  sha: string | null;
  tag: string | null;
  prerelease: boolean | null;
  contains: Record<string, boolean> | null;
  title: string;
  state: "open" | "closed" | "merged" | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  commitCount: number | null;
  commits: EvidenceCommit[] | null;
  checks: EvidenceCheck[] | null;
  checkCount: number | null;
  checksReadAt: string | null;
  source: "manual" | "suggested";
  author: string | null;
  url: string;
  repository: string;
  githubCreatedAt: string;
  githubUpdatedAt: string;
  githubClosedAt: string | null;
  linkedBy: string;
  linkedAt: string;
  refreshedAt: string;
};

export const EVIDENCE_REFERENCE_MAX = 300;

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isGitHubLink = (value: unknown): value is string => typeof value === "string" && value.startsWith("https://github.com/");
const isSha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const isCount = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);

function parseCommit(value: unknown): EvidenceCommit {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || !isSha(item.sha) || typeof item.message !== "string" ||
      (item.author !== null && typeof item.author !== "string") || !isDate(item.date) || !isGitHubLink(item.url)) {
    throw new Error("The API returned unexpected evidence.");
  }
  return { sha: item.sha, message: item.message, author: item.author, date: item.date, url: item.url };
}

function parseCheck(value: unknown): EvidenceCheck {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.name !== "string" ||
      !CHECK_RESULTS.includes(item.result as EvidenceCheck["result"]) || (item.url !== null && !isGitHubLink(item.url)) ||
      (item.completedAt !== null && !isDate(item.completedAt)) || (item.kind !== "check" && item.kind !== "status")) {
    throw new Error("The API returned unexpected evidence.");
  }
  return { name: item.name, result: item.result as EvidenceCheck["result"], url: item.url, completedAt: item.completedAt, kind: item.kind };
}

/** Validates one evidence link from an API response. Throws when the shape is not the documented one. */
export function parseEvidence(value: unknown): Evidence {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.requirementId !== "string" ||
      typeof item.title !== "string" || (item.author !== null && typeof item.author !== "string") || !isGitHubLink(item.url) ||
      typeof item.repository !== "string" || !isDate(item.githubCreatedAt) || !isDate(item.githubUpdatedAt) ||
      (item.githubClosedAt !== null && !isDate(item.githubClosedAt)) || !isCount(item.additions) || !isCount(item.deletions) ||
      !isCount(item.changedFiles) || !isCount(item.commitCount) || (item.commits !== null && !Array.isArray(item.commits)) ||
      (item.sha !== null && !isSha(item.sha)) || (item.checks !== null && !Array.isArray(item.checks)) || !isCount(item.checkCount) ||
      (item.checksReadAt !== null && !isDate(item.checksReadAt)) || (item.source !== "manual" && item.source !== "suggested") ||
      (item.tag !== null && typeof item.tag !== "string") || (item.prerelease !== null && typeof item.prerelease !== "boolean") ||
      (item.contains !== null && (typeof item.contains !== "object" || Array.isArray(item.contains) ||
        Object.values(item.contains as object).some(value => typeof value !== "boolean"))) ||
      typeof item.linkedBy !== "string" || !isDate(item.linkedAt) || !isDate(item.refreshedAt)) {
    throw new Error("The API returned unexpected evidence.");
  }
  // A commit is identified by its SHA; an issue or pull request by its number, and it has a state;
  // a release by its tag.
  const identity = item.kind === "commit"
    ? item.sha !== null && item.number === null && item.state === null && item.tag === null
    : item.kind === "release"
      ? typeof item.tag === "string" && item.tag.length > 0 && item.number === null && item.state === null
      : (item.kind === "issue" || item.kind === "pull_request") && typeof item.number === "number" && Number.isInteger(item.number) &&
        item.number > 0 && (item.state === "open" || item.state === "closed" || item.state === "merged") && item.tag === null;
  if (!identity) throw new Error("The API returned unexpected evidence.");
  return {
    id: item.id, requirementId: item.requirementId, kind: item.kind as Evidence["kind"], number: item.number as number | null,
    sha: item.sha, tag: item.tag, prerelease: item.prerelease, contains: item.contains as Record<string, boolean> | null,
    title: item.title, state: item.state as Evidence["state"], additions: item.additions, deletions: item.deletions,
    changedFiles: item.changedFiles, commitCount: item.commitCount,
    commits: item.commits === null ? null : (item.commits as unknown[]).map(parseCommit),
    checks: item.checks === null ? null : (item.checks as unknown[]).map(parseCheck),
    checkCount: item.checkCount, checksReadAt: item.checksReadAt, source: item.source,
    author: item.author, url: item.url, repository: item.repository, githubCreatedAt: item.githubCreatedAt,
    githubUpdatedAt: item.githubUpdatedAt, githubClosedAt: item.githubClosedAt, linkedBy: item.linkedBy, linkedAt: item.linkedAt,
    refreshedAt: item.refreshedAt,
  };
}

/** Validates an evidence list from an API response. Throws when it is not an array of evidence. */
export function parseEvidenceList(value: unknown): Evidence[] {
  if (!Array.isArray(value)) throw new Error("The API returned an unexpected evidence list.");
  return value.map(parseEvidence);
}

/** Returns the message for a trimmed issue or pull request reference, or null when the API should judge it. */
export function evidenceReferenceError(reference: string): string | null {
  if (!reference) return "Enter an issue or pull request number, a commit SHA, a release tag, or a GitHub link to one of them.";
  if (reference.length > EVIDENCE_REFERENCE_MAX) return `Use ${EVIDENCE_REFERENCE_MAX} characters or fewer.`;
  return null;
}

/** How an item is referred to in the list: "#42" for issues and pull requests, the tag for releases, a short SHA for commits. */
export function evidenceLabel(evidence: Pick<Evidence, "number" | "sha" | "tag">): string {
  if (evidence.number !== null) return `#${evidence.number}`;
  return evidence.tag ?? (evidence.sha ?? "").slice(0, 7);
}

export type ReleaseStatus = "included" | "not-included" | "not-merged" | "not-checked";

/**
 * Lists, for one release, every linked commit and pull request of the same repository with
 * whether the release's history includes it. "Included" means the commit is in that history; a
 * change that was later reverted is still in it. A pull request that is not merged cannot be in
 * a release. `summary` says how many are included, or null when there is nothing to compare.
 */
export function releaseContents(release: Evidence, evidence: Evidence[]): { summary: string | null; rows: { item: Evidence; status: ReleaseStatus }[] } {
  const rows = evidence
    .filter(item => (item.kind === "commit" || item.kind === "pull_request") && item.repository === release.repository)
    .map(item => {
      const checked = release.contains?.[item.id];
      const status: ReleaseStatus = item.kind === "pull_request" && item.state !== "merged" ? "not-merged"
        : checked === true ? "included" : checked === false ? "not-included" : "not-checked";
      return { item, status };
    });
  if (rows.length === 0) return { summary: null, rows };
  const included = rows.filter(row => row.status === "included").length;
  return { summary: `Contains ${included} of ${rows.length} linked ${rows.length === 1 ? "change" : "changes"}`, rows };
}

/** The tags of the linked releases whose history includes this commit or pull request, oldest release first. */
export function releasesContaining(item: Pick<Evidence, "id">, evidence: Evidence[]): string[] {
  return evidence.filter(other => other.kind === "release" && other.tag !== null && other.contains?.[item.id] === true).map(release => release.tag!);
}

/** Describes what changed in words, such as "+12 −3 in 2 files", or null when GitHub reported no counts. */
export function evidenceChanges(evidence: Pick<Evidence, "additions" | "deletions" | "changedFiles">): string | null {
  if (evidence.additions === null || evidence.deletions === null || evidence.changedFiles === null) return null;
  return `+${evidence.additions} −${evidence.deletions} in ${evidence.changedFiles === 1 ? "1 file" : `${evidence.changedFiles} files`}`;
}

/**
 * Describes a commit's or pull request's check results in words, such as "5 of 6 checks passed,
 * 1 failed". Returns null for issues and releases, which have no checks. "Passed" means only that a recorded
 * automated check reported success.
 */
export function checkSummary(evidence: Pick<Evidence, "kind" | "checks" | "checkCount">): string | null {
  if (evidence.kind === "issue" || evidence.kind === "release") return null;
  if (evidence.checks === null) return "Check results could not be read";
  const total = Math.max(evidence.checkCount ?? 0, evidence.checks.length);
  if (total === 0) return "No checks ran";
  const count = (result: EvidenceCheck["result"]) => evidence.checks!.filter(check => check.result === result).length;
  const parts = [`${count("passed")} of ${total} ${total === 1 ? "check" : "checks"} passed`];
  if (count("failed")) parts.push(`${count("failed")} failed`);
  if (count("running")) parts.push(`${count("running")} running`);
  return parts.join(", ");
}

/** Reads the `detail` of a problem-details body, or null when there is none. */
export function problemDetail(problem: unknown): string | null {
  const detail = (problem as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" && detail ? detail : null;
}
