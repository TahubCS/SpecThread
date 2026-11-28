import { expect, test } from "@playwright/test";
import { evidenceAuthors } from "../../app/web/src/lib/evidence";

// The distinct authors of a requirement's linked commits and pull requests (US-19).

const commit = (author: string | null) => ({ sha: "a".repeat(40), message: "m", author, date: "2026-09-01T00:00:00Z", url: "https://github.com/a/b/commit/a" });

test("authors of linked commits and pull requests are listed once each, alphabetically, without counts", () => {
  expect(evidenceAuthors([
    { kind: "pull_request", author: "grace", commits: [commit("ada"), commit("grace"), commit(null), commit("Linus Torvalds")] },
    { kind: "commit", author: "ada", commits: null },
    { kind: "commit", author: "Ada", commits: null },
    { kind: "commit", author: null, commits: null },
    // Issues and releases are not work anyone authored in code.
    { kind: "issue", author: "reporter", commits: null },
    { kind: "release", author: "release-bot", commits: null },
  ])).toEqual(["ada", "Ada", "grace", "Linus Torvalds"]);
  expect(evidenceAuthors([])).toEqual([]);
  expect(evidenceAuthors([{ kind: "commit", author: null, commits: null }])).toEqual([]);
});
