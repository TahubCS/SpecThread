import type { CriteriaVersion } from "./criteria-versions";
import { evidenceEventText, evidenceLabel, type Evidence, type EvidenceCheck, type EvidenceEvent } from "./evidence";
import { decisionText, type Review } from "./reviews";

/**
 * Where an event in a requirement's evidence thread comes from: a person's action in SpecThread,
 * or what GitHub reported about linked work. GitHub events name the GitHub account, or "GitHub"
 * for automated checks.
 */
export type ThreadSource = "specthread" | "github";

/** What kind of thing happened, for the marker beside it. */
export type ThreadKind = "requirement" | "criteria" | "link" | "issue" | "pull_request" | "commit" | "check" | "release" | "decision";

/**
 * One event in a requirement's evidence thread (US-16): what happened, who did it, and when.
 * `detail` is extra text, such as a decision's note. `url` opens the item on GitHub.
 */
export type ThreadEvent = {
  id: string;
  at: string;
  kind: ThreadKind;
  source: ThreadSource;
  text: string;
  actor: string;
  detail: string | null;
  url: string | null;
  result: EvidenceCheck["result"] | null;
};

const checkResultText: Record<EvidenceCheck["result"], string> = {
  passed: "Check passed", failed: "Check failed", running: "Check running", skipped: "Check skipped", cancelled: "Check cancelled",
  neutral: "Check finished without a result",
};

// Among events at the same moment, the order things happen in: work exists before it is linked,
// links before checks report, and decisions last.
const kindOrder: Record<ThreadKind, number> = {
  requirement: 0, criteria: 1, issue: 2, pull_request: 3, commit: 4, release: 5, link: 6, check: 7, decision: 8,
};

/**
 * Builds a requirement's evidence thread, oldest first and newest last: the requirement's creation,
 * each saved version of its acceptance criteria, every change to its evidence links, what GitHub
 * reported for the work that is linked now (issues and pull requests opened, merged, or closed;
 * commits; every finished check run; releases published), and every review decision with its note.
 *
 * GitHub's events are those of the links as they are now: work that was unlinked keeps only its
 * "Linked" and "Removed" events. A check that is still running has no time yet and is left out
 * until it reports. `nameOf` turns a SpecThread user ID into a name.
 */
export function buildThread({ requirement, versions, evidence, history, reviews, nameOf }: {
  requirement: { id: string; createdBy: string; createdAt: string };
  versions: CriteriaVersion[] | null;
  evidence: Evidence[];
  history: EvidenceEvent[] | null;
  reviews: Review[];
  nameOf: (userId: string) => string;
}): ThreadEvent[] {
  const events: ThreadEvent[] = [];
  const add = (event: Omit<ThreadEvent, "detail" | "url" | "result"> & Partial<Pick<ThreadEvent, "detail" | "url" | "result">>) =>
    events.push({ detail: null, url: null, result: null, ...event });

  add({ id: `requirement-${requirement.id}`, at: requirement.createdAt, kind: "requirement", source: "specthread",
    text: "Requirement created", actor: nameOf(requirement.createdBy) });

  for (const version of versions ?? []) {
    add({
      id: `criteria-${version.number}`, at: version.createdAt, kind: "criteria", source: "specthread",
      text: version.number === 1
        ? `Acceptance criteria version 1 saved (${criteriaCount(version.criteria.length)})`
        : `Acceptance criteria changed to version ${version.number} (${criteriaCount(version.criteria.length)})`,
      actor: nameOf(version.createdBy),
    });
  }

  for (const event of history ?? []) {
    add({ id: `link-${event.id}`, at: event.occurredAt, kind: "link", source: "specthread", text: evidenceEventText(event), actor: nameOf(event.actor) });
  }

  for (const item of evidence) {
    const label = evidenceLabel(item);
    const author = item.author ?? "an unknown author";
    const github = { source: "github" as const, url: item.url };
    switch (item.kind) {
      case "issue":
        add({ ...github, id: `github-${item.id}-opened`, at: item.githubCreatedAt, kind: "issue", text: `Issue ${label} “${item.title}” opened`, actor: author });
        if (item.state === "closed" && item.githubClosedAt) {
          add({ ...github, id: `github-${item.id}-closed`, at: item.githubClosedAt, kind: "issue", text: `Issue ${label} closed`, actor: "GitHub" });
        }
        break;
      case "pull_request":
        add({ ...github, id: `github-${item.id}-opened`, at: item.githubCreatedAt, kind: "pull_request",
          text: `Pull request ${label} “${item.title}” opened`, actor: author });
        if (item.state !== "open" && item.githubClosedAt) {
          add({ ...github, id: `github-${item.id}-closed`, at: item.githubClosedAt, kind: "pull_request",
            text: item.state === "merged" ? `Pull request ${label} merged` : `Pull request ${label} closed without merging`, actor: "GitHub" });
        }
        break;
      case "commit":
        add({ ...github, id: `github-${item.id}-committed`, at: item.githubCreatedAt, kind: "commit", text: `Commit ${label} “${item.title}”`, actor: author });
        break;
      case "release": {
        const included = evidence.filter(other => item.contains?.[other.id] === true).map(evidenceLabel);
        add({ ...github, id: `github-${item.id}-published`, at: item.githubCreatedAt, kind: "release",
          text: `${item.prerelease ? "Pre-release" : "Release"} ${label} “${item.title}” published`, actor: author,
          detail: included.length > 0 ? `Includes ${included.join(", ")}` : null });
        break;
      }
    }
    (item.checks ?? []).forEach((check, index) => {
      if (!check.completedAt) return;
      add({ id: `check-${item.id}-${index}`, at: check.completedAt, kind: "check", source: "github",
        text: `${checkResultText[check.result]}: ${check.name} on ${label}`, actor: "GitHub", url: check.url, result: check.result });
    });
  }

  for (const review of reviews) {
    add({
      id: `decision-${review.id}`, at: review.decidedAt, kind: "decision", source: "specthread",
      text: `${decisionText[review.decision]}${review.criteriaVersion === null ? "" : ` (acceptance criteria version ${review.criteriaVersion})`}`,
      actor: nameOf(review.decidedBy), detail: review.note || null,
    });
  }

  return events
    .map((event, index) => ({ event, index, time: Date.parse(event.at) }))
    .sort((a, b) => a.time - b.time || kindOrder[a.event.kind] - kindOrder[b.event.kind] || a.index - b.index)
    .map(({ event }) => event);
}

/** Counts the checks on linked work that are still running, which the thread leaves out until they report. */
export function runningChecks(evidence: Evidence[]): number {
  return evidence.reduce((total, item) => total + (item.checks ?? []).filter(check => !check.completedAt).length, 0);
}

function criteriaCount(count: number): string {
  return count === 1 ? "1 criterion" : `${count} criteria`;
}
