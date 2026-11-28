import { expect, test } from "@playwright/test";
import { EVIDENCE_FILTER_TEXT, evidenceSummary, matchesEvidence, parseEvidenceFilter } from "../../app/web/src/lib/projects";

// The project's evidence status counts and filters (US-18), without a browser.

const requirement = (evidenceMissing: ("issue" | "merged_pull_request" | "passing_checks" | "release")[], sharedPullRequests: number[] = []) =>
  ({ evidenceComplete: evidenceMissing.length === 0, evidenceMissing, sharedPullRequests });

test("requirements are counted by every evidence status, and one missing two parts counts in both", () => {
  const requirements = [
    requirement([]), requirement([], [9]), requirement(["release"]), requirement(["passing_checks", "release"], [9]),
    requirement(["issue", "merged_pull_request", "passing_checks", "release"]),
  ];
  expect(evidenceSummary(requirements)).toEqual([
    { filter: "complete", count: 2 }, { filter: "issue", count: 1 }, { filter: "merged_pull_request", count: 1 },
    { filter: "passing_checks", count: 2 }, { filter: "release", count: 3 }, { filter: "shared", count: 2 },
  ]);
  expect(evidenceSummary([]).every(entry => entry.count === 0)).toBe(true);
  expect(matchesEvidence(requirement(["release"]), "release")).toBe(true);
  expect(matchesEvidence(requirement(["release"]), "complete")).toBe(false);
  expect(matchesEvidence(requirement([], [3]), "shared")).toBe(true);
  // The previous API sends no evidence status: such a requirement is neither complete nor missing anything.
  const unknown = { evidenceComplete: false, evidenceMissing: [], sharedPullRequests: [] };
  expect(["complete", "issue", "release", "shared"].some(filter => matchesEvidence(unknown, filter as never))).toBe(false);
});

test("only known evidence statuses are read from the address, and each reads plainly", () => {
  for (const value of ["complete", "issue", "merged_pull_request", "passing_checks", "release", "shared"]) expect(parseEvidenceFilter(value)).toBe(value);
  for (const value of [undefined, "", "Complete", "verified", ["release"], "release "]) expect(parseEvidenceFilter(value)).toBeNull();
  expect(EVIDENCE_FILTER_TEXT).toEqual({
    complete: "Evidence complete", issue: "missing an issue", merged_pull_request: "missing a merged pull request",
    passing_checks: "missing passing checks", release: "missing a release", shared: "sharing a pull request with another requirement",
  });
});
