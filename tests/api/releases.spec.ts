import { expect, test } from "@playwright/test";
import {
  formatDeployedOn, includedText, parseRelease, parseReleases, releaseFormError, releasesIncluding, type ProjectRelease,
} from "../../app/web/src/lib/releases";

// Parsing and wording of recorded releases (ADR-066, US-13), without a browser.

const release: ProjectRelease = {
  id: "rel1", projectId: "p1", tag: "v1.2", name: "Spring release", url: "https://github.com/acme/web/releases/tag/v1.2", sha: "a".repeat(40),
  author: "ada", prerelease: false, publishedAt: "2026-09-25T10:00:00Z", environment: "Production", deployedOn: "2026-09-26",
  recordedBy: "u1", recordedAt: "2026-09-26T12:00:00Z", comparedAt: "2026-09-26T12:00:00Z", compared: 3,
  requirements: [{ id: "r1", title: "Checkout", archivedAt: null, changes: [{ evidenceId: "e1", kind: "pull_request", label: "#9", title: "Add guest checkout" }] }],
};

test("releases are accepted only in the documented shape", () => {
  expect(parseReleases([{ ...release, extra: 1 }])).toEqual([release]);
  for (const value of [null, {}, { ...release, tag: "" }, { ...release, url: "https://evil.example/r" }, { ...release, sha: "abc" },
    { ...release, author: 5 }, { ...release, prerelease: "no" }, { ...release, environment: "" }, { ...release, deployedOn: "26/09/2026" },
    { ...release, deployedOn: "2026-09-26T00:00:00Z" }, { ...release, recordedAt: "soon" }, { ...release, compared: -1 }, { ...release, compared: 1.5 },
    { ...release, requirements: {} }, { ...release, requirements: [{ ...release.requirements[0], changes: [{ evidenceId: "e1", kind: "issue", label: "#3", title: "x" }] }] },
    { ...release, requirements: [{ ...release.requirements[0], archivedAt: "later" }] }]) {
    expect(() => parseRelease(value), JSON.stringify(value)).toThrow("unexpected release");
  }
  expect(() => parseReleases({})).toThrow("unexpected release list");
});

test("a requirement's deployments, the date, the count, and the form checks read plainly", () => {
  const staging = { ...release, id: "rel2", environment: "Staging", requirements: [] };
  expect(releasesIncluding("r1", [release, staging])).toEqual([release]);
  expect(releasesIncluding("r9", [release, staging])).toEqual([]);
  // A calendar date is shown as itself in every time zone.
  expect(formatDeployedOn("2026-09-26")).toBe("Sep 26, 2026");
  expect(includedText(release)).toBe("Includes 1 requirement");
  expect(includedText(staging)).toBe("Includes no requirements");
  expect(includedText({ requirements: [release.requirements[0], release.requirements[0]] })).toBe("Includes 2 requirements");
  expect(releaseFormError("tag", "")).toBe("Enter the release's tag as it appears on GitHub.");
  expect(releaseFormError("tag", "v 1")).toBe("A tag has no spaces. Enter it as it appears on GitHub.");
  expect(releaseFormError("tag", "v".repeat(256))).toBe("Use 255 characters or fewer.");
  expect(releaseFormError("environment", "")).toBe("Enter the environment it was deployed to.");
  expect(releaseFormError("environment", "x".repeat(51))).toBe("Use 50 characters or fewer.");
  expect(releaseFormError("deployedOn", "")).toBe("Enter the date the release was deployed.");
  expect(releaseFormError("deployedOn", "Sept 26")).toBe("Enter the date as YYYY-MM-DD.");
  for (const [field, value] of [["tag", "v1.2"], ["environment", "Production"], ["deployedOn", "2026-09-26"]] as const) {
    expect(releaseFormError(field, value)).toBeNull();
  }
});
