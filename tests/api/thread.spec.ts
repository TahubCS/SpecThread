import { expect, test } from "@playwright/test";
import type { Evidence, EvidenceEvent } from "../../app/web/src/lib/evidence";
import type { Review } from "../../app/web/src/lib/reviews";
import { buildThread, runningChecks } from "../../app/web/src/lib/thread";

// The evidence thread (US-16, US-20) is built from data the requirement page already reads, so
// its order and wording are checked here without a browser.

const names: Record<string, string> = { u1: "Danielle", u2: "Robert" };
const nameOf = (userId: string) => names[userId] ?? "a former member";
const sha = "a".repeat(40);

const base: Evidence = {
  id: "e-pr", requirementId: "r1", kind: "pull_request", number: 9, sha, tag: null, prerelease: null, contains: null,
  title: "Add guest checkout", state: "merged", additions: 1, deletions: 0, changedFiles: 1, commitCount: 1, commits: [],
  checks: [], checkCount: 0, checksReadAt: "2026-09-12T00:00:00Z", source: "manual", author: "ada",
  url: "https://github.com/acme/web/pull/9", repository: "acme/web", githubCreatedAt: "2026-09-05T10:00:00Z",
  githubUpdatedAt: "2026-09-06T10:00:00Z", githubClosedAt: "2026-09-06T10:00:00Z", linkedBy: "u1", linkedAt: "2026-09-07T10:00:00Z",
  refreshedAt: "2026-09-12T00:00:00Z",
};
const check = (name: string, result: "passed" | "failed" | "running", completedAt: string | null) =>
  ({ name, result, url: `https://github.com/acme/web/runs/${name}`, completedAt, kind: "check" as const });

const evidence: Evidence[] = [
  { ...base, kind: "issue", id: "e-issue", number: 4, sha: null, title: "Guests cannot pay", state: "closed", checks: null, checkCount: null,
    commits: null, url: "https://github.com/acme/web/issues/4", githubCreatedAt: "2026-09-01T10:00:00Z", githubClosedAt: "2026-09-06T10:05:00Z" },
  { ...base, checks: [check("build", "failed", "2026-09-05T11:00:00Z"), check("build", "passed", "2026-09-05T12:00:00Z"), check("e2e", "running", null)] },
  { ...base, kind: "release", id: "e-rel", number: null, state: null, tag: "v1.2", title: "Spring release", prerelease: false,
    contains: { "e-pr": true }, checks: null, checkCount: null, commits: null, url: "https://github.com/acme/web/releases/tag/v1.2",
    githubCreatedAt: "2026-09-10T10:00:00Z", githubClosedAt: null, author: null },
];
const history: EvidenceEvent[] = [
  { id: "h2", evidenceId: "e-pr", action: "added", kind: "pull_request", label: "#9", title: "Add guest checkout", actor: "u1",
    occurredAt: "2026-09-07T10:00:00Z", otherRequirementId: null, otherRequirementTitle: null },
  { id: "h3", evidenceId: "e-rel", action: "added", kind: "release", label: "v1.2", title: "Spring release", actor: "u1",
    occurredAt: "2026-09-12T09:00:00Z", otherRequirementId: null, otherRequirementTitle: null },
  { id: "h1", evidenceId: "e-issue", action: "added", kind: "issue", label: "#4", title: "Guests cannot pay", actor: "u9",
    occurredAt: "2026-09-02T10:00:00Z", otherRequirementId: null, otherRequirementTitle: null },
];
const review = (id: string, decision: Review["decision"], note: string, decidedAt: string): Review =>
  ({ id, requirementId: "r1", decision, note, requirementVersion: 1, criteriaVersion: 1, evidence: [], decidedBy: "u2", decidedAt });

test("the thread lists every event oldest first, with what happened, who did it, and when", () => {
  const thread = buildThread({
    requirement: { id: "r1", createdBy: "u1", createdAt: "2026-08-30T10:00:00Z" },
    versions: [
      { number: 1, criteria: ["Pay as guest"], createdBy: "u1", createdAt: "2026-08-30T10:00:00Z" },
      { number: 2, criteria: ["Pay as guest", "Email receipt"], createdBy: "u1", createdAt: "2026-09-03T10:00:00Z" },
    ],
    evidence, history,
    reviews: [
      review("d1", "more_evidence", "Link the release.", "2026-09-11T10:00:00Z"),
      review("d2", "accepted", "", "2026-09-13T10:00:00Z"),
    ],
    nameOf,
  });
  expect(thread.map(event => [event.at, event.text, event.actor, event.detail])).toEqual([
    ["2026-08-30T10:00:00Z", "Requirement created", "Danielle", null],
    ["2026-08-30T10:00:00Z", "Acceptance criteria version 1 saved (1 criterion)", "Danielle", null],
    ["2026-09-01T10:00:00Z", "Issue #4 “Guests cannot pay” opened", "ada", null],
    ["2026-09-02T10:00:00Z", "Linked #4 “Guests cannot pay”", "a former member", null],
    ["2026-09-03T10:00:00Z", "Acceptance criteria changed to version 2 (2 criteria)", "Danielle", null],
    ["2026-09-05T10:00:00Z", "Pull request #9 “Add guest checkout” opened", "ada", null],
    ["2026-09-05T11:00:00Z", "Check failed: build on #9", "GitHub", null],
    ["2026-09-05T12:00:00Z", "Check passed: build on #9", "GitHub", null],
    ["2026-09-06T10:00:00Z", "Pull request #9 merged", "GitHub", null],
    ["2026-09-06T10:05:00Z", "Issue #4 closed", "GitHub", null],
    ["2026-09-07T10:00:00Z", "Linked #9 “Add guest checkout”", "Danielle", null],
    ["2026-09-10T10:00:00Z", "Release v1.2 “Spring release” published", "an unknown author", "Includes #9"],
    ["2026-09-11T10:00:00Z", "More evidence requested (acceptance criteria version 1)", "Robert", "Link the release."],
    // Evidence added after a decision appears after it (US-20).
    ["2026-09-12T09:00:00Z", "Linked v1.2 “Spring release”", "Danielle", null],
    ["2026-09-13T10:00:00Z", "Accepted (acceptance criteria version 1)", "Robert", null],
  ]);
  // GitHub's events link to the item, checks to their log; SpecThread's events link nowhere.
  expect(thread.find(event => event.text === "Check failed: build on #9")).toMatchObject({ source: "github", url: "https://github.com/acme/web/runs/build", result: "failed" });
  expect(thread.find(event => event.text.startsWith("Issue #4 “"))).toMatchObject({ source: "github", url: "https://github.com/acme/web/issues/4" });
  expect(thread.filter(event => event.source === "specthread").every(event => event.url === null)).toBe(true);
  expect(new Set(thread.map(event => event.id)).size).toBe(thread.length);
  // A running check has no time yet: it is counted, not placed.
  expect(thread.some(event => event.text.includes("e2e"))).toBe(false);
  expect(runningChecks(evidence)).toBe(1);
});

test("the thread never claims proof, and states open, closed, and unmerged work as GitHub reported it", () => {
  const thread = buildThread({
    requirement: { id: "r1", createdBy: "u1", createdAt: "2026-08-30T10:00:00Z" },
    versions: null, history: null, reviews: [review("d1", "rejected", "Fails on Safari.", "2026-09-20T10:00:00Z")], nameOf,
    evidence: [
      { ...base, id: "open", number: 10, state: "open", githubClosedAt: null },
      { ...base, id: "closed", number: 11, state: "closed", githubClosedAt: "2026-09-08T10:00:00Z" },
      { ...base, id: "commit", kind: "commit", number: null, state: null, title: "Fix rounding", commits: null, githubClosedAt: null, author: null },
      { ...base, id: "pre", kind: "release", number: null, state: null, tag: "v2.0-rc1", title: "RC", prerelease: true, contains: {},
        checks: null, githubClosedAt: null },
    ],
  });
  const texts = thread.map(event => event.text);
  expect(texts).toContain("Pull request #10 “Add guest checkout” opened");
  expect(texts.filter(text => text.startsWith("Pull request #10"))).toHaveLength(1);
  expect(texts).toContain("Pull request #11 closed without merging");
  expect(texts).toContain("Commit aaaaaaa “Fix rounding”");
  expect(texts).toContain("Pre-release v2.0-rc1 “RC” published");
  expect(thread.find(event => event.text.startsWith("Pre-release"))!.detail).toBeNull();
  expect(thread.at(-1)).toMatchObject({ text: "Rejected (acceptance criteria version 1)", detail: "Fails on Safari.", actor: "Robert" });
  expect(texts.join(" ")).not.toMatch(/verified|proven|proof/i);
  // Unreadable history and versions leave the rest of the thread intact.
  expect(thread[0].text).toBe("Requirement created");
});

test("events at the same moment keep a natural order, and a decision without a criteria version says so plainly", () => {
  const at = "2026-09-01T10:00:00Z";
  const thread = buildThread({
    requirement: { id: "r1", createdBy: "u1", createdAt: at },
    versions: [{ number: 1, criteria: ["A"], createdBy: "u1", createdAt: at }],
    evidence: [{ ...base, githubCreatedAt: at, githubClosedAt: null, state: "open", checks: [check("lint", "passed", at)] }],
    history: [{ ...history[0], occurredAt: at }],
    reviews: [{ ...review("d1", "accepted", "", at), criteriaVersion: null }],
    nameOf,
  });
  expect(thread.map(event => event.kind)).toEqual(["requirement", "criteria", "pull_request", "link", "check", "decision"]);
  expect(thread.at(-1)!.text).toBe("Accepted");
});
