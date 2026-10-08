import { expect, test } from "@playwright/test";
import {
  fieldError, formatDate, isUuid, parseMembers, parseProject, parseProjects, parseRequirementSummaries, projectNameError,
} from "../../app/web/src/lib/projects";
import {
  parseRequirement, readRequirementInput, requirementErrors, requirementProblemErrors,
} from "../../app/web/src/lib/requirements";
import {
  checkSummary, evidenceChanges, evidenceLabel, evidenceReferenceError, parseEvidence, parseEvidenceList, problemDetail,
  releaseContents, releasesContaining,
} from "../../app/web/src/lib/evidence";
import { parseAvailableRepositories, parseProjectRepository, parseRepositoryChoice } from "../../app/web/src/lib/repositories";
import { parseReview, parseReviews, parseReviewSummary, reviewedText, reviewError, reviewOutdated } from "../../app/web/src/lib/reviews";

const project = { id: "p1", name: "Billing", ownerUserId: "u1", createdAt: "2026-10-01T10:00:00.123456Z", archivedAt: null };

test("project responses are accepted only in the documented shape", () => {
  expect(parseProject({ ...project, extra: true })).toEqual(project);
  expect(parseProjects([project, { ...project, archivedAt: "2026-10-02T00:00:00Z" }])).toHaveLength(2);
  for (const value of [null, "text", {}, { ...project, id: 1 }, { ...project, name: undefined },
    { ...project, createdAt: "yesterday" }, { ...project, archivedAt: 0 }]) {
    expect(() => parseProject(value)).toThrow("unexpected project");
  }
  expect(() => parseProjects({ items: [] })).toThrow("unexpected project list");
  expect(() => parseProjects([project, {}])).toThrow("unexpected project");
});

test("project names must be present and within the API limit", () => {
  expect(projectNameError("Billing")).toBeNull();
  expect(projectNameError("x".repeat(200))).toBeNull();
  expect(projectNameError("")).toBe("Enter a project name.");
  expect(projectNameError("x".repeat(201))).toBe("Use 200 characters or fewer.");
});

test("field messages are read from validation problem details", () => {
  expect(fieldError({ errors: { name: ["Name is required.", "second"] } }, "name")).toBe("Name is required.");
  for (const problem of [null, "text", {}, { errors: null }, { errors: { title: ["x"] } }, { errors: { name: "x" } }, { errors: { name: [] } }]) {
    expect(fieldError(problem, "name")).toBeNull();
  }
});

test("only UUID-shaped project IDs are sent to the API", () => {
  expect(isUuid("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
  expect(isUuid("0F8FAD5B-D9CB-469F-A165-70867728950E")).toBe(true);
  for (const value of ["", "new", "example-project", "0f8fad5b-d9cb-469f-a165-70867728950e/members", "../me",
    "0f8fad5b-d9cb-469f-a165-70867728950e?x=1", " 0f8fad5b-d9cb-469f-a165-70867728950e"]) {
    expect(isUuid(value), value).toBe(false);
  }
});

test("requirement and member lists are accepted only in the documented shape", () => {
  const requirement = { id: "r1", projectId: "p1", title: "Guest checkout", version: 2,
    createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", archivedAt: null, review: null };
  expect(parseRequirementSummaries([{ ...requirement, description: "ignored" }])).toEqual([requirement]);
  const review = { decision: "more_evidence", decidedBy: "u2", decidedAt: "2026-10-03T10:00:00Z", outdated: true };
  expect(parseRequirementSummaries([{ ...requirement, review: { ...review, note: "ignored" } }])).toEqual([{ ...requirement, review }]);
  for (const value of [undefined, "accepted", {}, { ...review, decision: "verified" }, { ...review, outdated: "no" }, { ...review, decidedAt: "soon" }, { ...review, decidedBy: 1 }]) {
    expect(() => parseRequirementSummaries([{ ...requirement, review: value }]), JSON.stringify(value)).toThrow("unexpected review");
  }
  for (const value of [null, {}, [null], [{ ...requirement, version: "2" }], [{ ...requirement, updatedAt: "soon" }], [{ ...requirement, title: 1 }]]) {
    expect(() => parseRequirementSummaries(value)).toThrow("unexpected requirement");
  }

  const member = { userId: "u1", name: "Ada", email: "ada@example.invalid", joinedAt: "2026-10-01T10:00:00Z", isOwner: true };
  expect(parseMembers([{ ...member, extra: 1 }])).toEqual([member]);
  for (const value of [null, {}, [null], [{ ...member, isOwner: "yes" }], [{ ...member, joinedAt: "" }], [{ ...member, email: null }]]) {
    expect(() => parseMembers(value)).toThrow(/unexpected (member list|project member)/);
  }
});

test("dates are shown as short UTC dates", () => {
  expect(formatDate("2026-10-08T23:59:59Z")).toBe("Oct 8, 2026");
  expect(formatDate("2026-10-08T00:00:00+05:00")).toBe("Oct 7, 2026");
});

test("a requirement response is accepted only in the documented shape, with criteria in order", () => {
  const requirement = { id: "r1", projectId: "p1", title: "Guest checkout", description: "", createdBy: "u1", version: 2,
    createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", archivedAt: null,
    acceptanceCriteria: [{ id: "c2", text: "Second", position: 1 }, { id: "c1", text: "First", position: 0 }] };
  expect(parseRequirement(requirement).acceptanceCriteria.map(criterion => criterion.text)).toEqual(["First", "Second"]);
  for (const value of [null, {}, { ...requirement, description: null }, { ...requirement, createdBy: 1 },
    { ...requirement, acceptanceCriteria: null }, { ...requirement, version: "2" }]) {
    expect(() => parseRequirement(value)).toThrow("unexpected requirement");
  }
  expect(() => parseRequirement({ ...requirement, acceptanceCriteria: [{ id: "c", text: 1, position: 0 }] })).toThrow("unexpected acceptance criterion");
});

test("requirement input is trimmed and checked against the API limits", () => {
  const form = new FormData();
  form.set("title", "  Guest checkout  ");
  form.set("description", "  Buy without an account.  ");
  form.append("criteria", " First ");
  form.append("criteria", "   ");
  const input = readRequirementInput(form);
  expect(input).toEqual({ title: "Guest checkout", description: "Buy without an account.", criteria: ["First", ""] });
  expect(requirementErrors(input)).toEqual({ items: { 1: "Enter the criterion or remove it." } });
  expect(requirementErrors({ title: "T", description: "", criteria: [] })).toBeNull();
  expect(requirementErrors({ title: "x".repeat(200), description: "x".repeat(10_000), criteria: Array(50).fill("x".repeat(2_000)) })).toBeNull();
  expect(requirementErrors({ title: "", description: "x".repeat(10_001), criteria: Array(51).fill("ok").concat("x".repeat(2_001)) })).toEqual({
    title: "Enter a title.", description: "Use 10,000 characters or fewer.", criteria: "Use 50 acceptance criteria or fewer.",
    items: { 51: "Use 2,000 characters or fewer." },
  });
  expect(requirementErrors({ title: "x".repeat(201), description: "", criteria: [] })?.title).toBe("Use 200 characters or fewer.");
  expect(readRequirementInput(new FormData())).toEqual({ title: "", description: "", criteria: [] });
});

test("requirement validation problems are mapped to their fields", () => {
  expect(requirementProblemErrors({ errors: {
    title: ["Enter a value."], description: ["Too long."], acceptanceCriteria: ["Too many."], "acceptanceCriteria[2]": ["Enter a value."],
  } }, "Failed")).toEqual({ title: "Enter a value.", description: "Too long.", criteria: "Too many.", items: { 2: "Enter a value." } });
  for (const problem of [null, {}, { errors: {} }, { errors: { version: ["Send the version you loaded."] } }, { errors: { title: "text" } }]) {
    expect(requirementProblemErrors(problem, "Failed")).toEqual({ items: {}, form: "Failed" });
  }
});

test("repository connections and choices are accepted only in the documented shape", () => {
  const repository = { installationId: 11, repositoryId: 101, owner: "acme", name: "web", fullName: "acme/web",
    url: "https://github.com/acme/web", isPrivate: true, connectedBy: "u1", connectedAt: "2026-10-08T10:00:00Z" };
  expect(parseProjectRepository({ repository: null })).toBeNull();
  expect(parseProjectRepository({ repository: { ...repository, extra: 1 } })).toEqual(repository);
  for (const value of [null, {}, { repository: {} }, { repository: { ...repository, installationId: "11" } },
    { repository: { ...repository, repositoryId: 0 } }, { repository: { ...repository, url: "https://evil.example/acme/web" } },
    { repository: { ...repository, url: "javascript:alert(1)" } }, { repository: { ...repository, connectedAt: "soon" } }]) {
    expect(() => parseProjectRepository(value)).toThrow("unexpected repository connection");
  }

  const available = { installationId: 11, repositoryId: 101, owner: "acme", name: "web", fullName: "acme/web", isPrivate: false };
  expect(parseAvailableRepositories({ installUrl: null, repositories: [{ ...available, extra: 1 }], truncated: false }))
    .toEqual({ installUrl: null, repositories: [available], truncated: false });
  for (const value of [null, [], { installUrl: null, repositories: [], truncated: "no" }, { installUrl: "https://evil.example/install", repositories: [], truncated: false },
    { installUrl: null, repositories: [{ ...available, repositoryId: 1.5 }], truncated: false }, { installUrl: null, repositories: [null], truncated: false }]) {
    expect(() => parseAvailableRepositories(value)).toThrow(/unexpected repository/);
  }

  expect(parseRepositoryChoice("11:101")).toEqual({ installationId: 11, repositoryId: 101 });
  for (const value of [null, undefined, "", "11", "11:", ":101", "0:101", "11:0", "11:101:5", "-1:101", "1e3:101", "11:abc", " 11:101", "9".repeat(16) + ":1"]) {
    expect(parseRepositoryChoice(value), String(value)).toBeNull();
  }
});

test("evidence is accepted only in the documented shape", () => {
  const sha = "a".repeat(40);
  const commit = { sha, message: "Add guest path", author: "ada", date: "2026-09-06T09:00:00Z", url: `https://github.com/acme/web/commit/${sha}` };
  const evidence = { id: "e1", requirementId: "r1", kind: "pull_request", number: 5, sha, tag: null, prerelease: null, contains: null,
    title: "Add guest checkout", state: "merged",
    additions: 40, deletions: 5, changedFiles: 3, commitCount: 1, commits: [commit],
    checks: [{ name: "build", result: "passed", url: "https://github.com/acme/web/runs/1", completedAt: "2026-09-06T10:05:00Z", kind: "check" }],
    checkCount: 1, checksReadAt: "2026-10-08T10:00:00Z", source: "manual",
    author: null, url: "https://github.com/acme/web/pull/5", repository: "acme/web", githubCreatedAt: "2026-09-06T10:00:00Z",
    githubUpdatedAt: "2026-10-01T10:00:00Z", githubClosedAt: "2026-10-06T10:00:00Z", linkedBy: "u1",
    linkedAt: "2026-10-08T10:00:00Z", refreshedAt: "2026-10-08T10:00:00Z" };
  const issue = { ...evidence, kind: "issue", state: "open", author: "ada", sha: null, additions: null, deletions: null,
    changedFiles: null, commitCount: null, commits: null, checks: null, checkCount: null, checksReadAt: null, githubClosedAt: null };
  const linkedCommit = { ...issue, kind: "commit", number: null, state: null, sha, additions: 12, deletions: 3, changedFiles: 1 };
  expect(parseEvidenceList([{ ...evidence, extra: 1 }])).toEqual([evidence]);
  expect(parseEvidence(issue).author).toBe("ada");
  expect(parseEvidence(linkedCommit)).toEqual(linkedCommit);
  for (const value of [null, {}, { ...evidence, kind: "release" }, { ...evidence, state: "draft" }, { ...evidence, number: 5.5 },
    { ...evidence, number: 0 }, { ...evidence, state: null }, { ...evidence, sha: "abc" }, { ...evidence, additions: -1 },
    { ...evidence, commitCount: 1.5 }, { ...evidence, commits: {} }, { ...evidence, commits: [{ ...commit, sha: "A".repeat(40) }] },
    { ...evidence, commits: [{ ...commit, url: "https://evil.example/c" }] }, { ...linkedCommit, sha: null },
    { ...linkedCommit, number: 5 }, { ...linkedCommit, state: "open" },
    { ...evidence, tag: "v1" }, { ...evidence, tag: 5 }, { ...evidence, prerelease: "no" }, { ...evidence, contains: [] },
    { ...evidence, contains: { e2: "yes" } }, { ...linkedCommit, tag: "v1" }, { ...linkedCommit, kind: "release" },
    { ...linkedCommit, kind: "release", tag: "" }, { ...linkedCommit, kind: "release", tag: "v1", number: 1 },
    { ...evidence, source: "ai" }, { ...evidence, source: undefined }, { ...evidence, checks: {} }, { ...evidence, checkCount: -1 },
    { ...evidence, checksReadAt: "soon" }, { ...evidence, checks: [{ ...evidence.checks[0], result: "verified" }] },
    { ...evidence, checks: [{ ...evidence.checks[0], url: "https://ci.example/1" }] }, { ...evidence, checks: [{ ...evidence.checks[0], kind: "ai" }] },
    { ...evidence, checks: [{ ...evidence.checks[0], completedAt: "later" }] }, { ...evidence, checks: [null] },
    { ...evidence, url: "https://evil.example/acme/web/pull/5" }, { ...evidence, url: "javascript:alert(1)" },
    { ...evidence, author: 1 }, { ...evidence, githubCreatedAt: "soon" }, { ...evidence, githubClosedAt: "later" }, { ...evidence, refreshedAt: null }]) {
    expect(() => parseEvidence(value)).toThrow("unexpected evidence");
  }
  expect(() => parseEvidenceList({})).toThrow("unexpected evidence list");

  expect(evidenceReferenceError("42")).toBeNull();
  expect(evidenceReferenceError("")).toBe("Enter an issue or pull request number, a commit SHA, a release tag, or a GitHub link to one of them.");
  expect(evidenceReferenceError("x".repeat(301))).toBe("Use 300 characters or fewer.");
  expect(evidenceLabel({ number: 5, sha, tag: null })).toBe("#5");
  expect(evidenceLabel({ number: null, sha, tag: null })).toBe("aaaaaaa");
  expect(evidenceLabel({ number: null, sha, tag: "v1.4.0" })).toBe("v1.4.0");

  // Releases: what each contains, in words, from the comparison stored on the release.
  const base = { ...linkedCommit, checks: null, checkCount: null, checksReadAt: null };
  const first = parseEvidence({ ...base, id: "c1", title: "First" });
  const second = parseEvidence({ ...base, id: "c2", title: "Second", sha: "b".repeat(40) });
  const unchecked = parseEvidence({ ...base, id: "c3", title: "Third", sha: "c".repeat(40) });
  const elsewhere = parseEvidence({ ...base, id: "c4", title: "Other repository", sha: "d".repeat(40), repository: "acme/old" });
  const merged = parseEvidence({ ...evidence, id: "p1" });
  const open = parseEvidence({ ...evidence, id: "p2", number: 6, state: "open" });
  const release = parseEvidence({ ...base, id: "r1", kind: "release", tag: "v1.4.0", prerelease: false, sha,
    contains: { c1: true, c2: false, p1: true, p2: true, gone: true } });
  const later = parseEvidence({ ...base, id: "r2", kind: "release", tag: "v2", prerelease: true, sha, contains: { c1: true, c2: true } });
  const all = [first, second, unchecked, elsewhere, merged, open, parseEvidence(issue), release, later];
  expect(checkSummary(release)).toBeNull();
  const contents = releaseContents(release, all);
  expect(contents.summary).toBe("Contains 2 of 5 linked changes");
  expect(contents.rows.map(row => [row.item.id, row.status])).toEqual([
    ["c1", "included"], ["c2", "not-included"], ["c3", "not-checked"], ["p1", "included"], ["p2", "not-merged"],
  ]);
  expect(releaseContents(release, [first]).summary).toBe("Contains 1 of 1 linked change");
  expect(releaseContents(release, [parseEvidence(issue), elsewhere, release])).toEqual({ summary: null, rows: [] });
  expect(releaseContents(parseEvidence({ ...base, id: "r3", kind: "release", tag: "v0", prerelease: false, contains: null }), [first]).rows[0].status).toBe("not-checked");
  expect(releasesContaining(first, all)).toEqual(["v1.4.0", "v2"]);
  expect(releasesContaining(second, all)).toEqual(["v2"]);
  expect(releasesContaining(unchecked, all)).toEqual([]);
  expect(evidenceChanges({ additions: 12, deletions: 3, changedFiles: 1 })).toBe("+12 −3 in 1 file");
  expect(evidenceChanges({ additions: 0, deletions: 0, changedFiles: 4 })).toBe("+0 −0 in 4 files");
  expect(evidenceChanges({ additions: null, deletions: null, changedFiles: null })).toBeNull();
  expect(parseEvidence({ ...evidence, source: "suggested" }).source).toBe("suggested");
  expect(parseEvidence({ ...evidence, checks: [{ name: "ci", result: "running", url: null, completedAt: null, kind: "status" }] }).checks)
    .toEqual([{ name: "ci", result: "running", url: null, completedAt: null, kind: "status" }]);

  const check = (result: string) => ({ name: result, result, url: null, completedAt: null, kind: "check" }) as never;
  expect(checkSummary({ kind: "issue", checks: null, checkCount: null })).toBeNull();
  expect(checkSummary({ kind: "commit", checks: null, checkCount: null })).toBe("Check results could not be read");
  expect(checkSummary({ kind: "pull_request", checks: [], checkCount: 0 })).toBe("No checks ran");
  expect(checkSummary({ kind: "commit", checks: [check("passed")], checkCount: 1 })).toBe("1 of 1 check passed");
  expect(checkSummary({ kind: "commit", checks: [check("passed"), check("skipped"), check("neutral"), check("cancelled")], checkCount: 4 }))
    .toBe("1 of 4 checks passed");
  expect(checkSummary({ kind: "pull_request", checks: [check("passed"), check("failed"), check("failed"), check("running")], checkCount: 4 }))
    .toBe("1 of 4 checks passed, 2 failed, 1 running");
  // GitHub's total can exceed the checks that were stored.
  expect(checkSummary({ kind: "commit", checks: [check("passed")], checkCount: 150 })).toBe("1 of 150 checks passed");
  expect(problemDetail({ detail: "#7 is already linked to this requirement." })).toBe("#7 is already linked to this requirement.");
  for (const problem of [null, "text", {}, { detail: "" }, { detail: 5 }]) expect(problemDetail(problem)).toBeNull();
});

test("review responses are accepted only in the documented shape", () => {
  const link = { id: "e1", kind: "issue", label: "#9", title: "Guests cannot pay", state: "open" };
  const review = { id: "v1", requirementId: "r1", decision: "rejected", note: "Cart is emptied.", requirementVersion: 3,
    evidence: [link, { ...link, id: "e2", kind: "commit", label: "abc1234", state: null }], decidedBy: "u2", decidedAt: "2026-10-03T10:00:00Z" };
  expect(parseReview({ ...review, extra: 1, evidence: review.evidence.map(entry => ({ ...entry, extra: 1 })) })).toEqual(review);
  expect(parseReviews([review, { ...review, decision: "accepted", note: "", evidence: [] }])).toHaveLength(2);
  expect(parseReviewSummary(null)).toBeNull();
  for (const value of [null, "text", {}, { ...review, decision: "verified" }, { ...review, note: null }, { ...review, requirementVersion: 0 },
    { ...review, requirementVersion: 1.5 }, { ...review, requirementVersion: "3" }, { ...review, evidence: null }, { ...review, evidence: [null] },
    { ...review, evidence: [{ ...link, state: 1 }] }, { ...review, evidence: [{ ...link, label: undefined }] }, { ...review, decidedAt: "soon" }, { ...review, decidedBy: 2 }]) {
    expect(() => parseReview(value), JSON.stringify(value)).toThrow("unexpected review");
  }
  expect(() => parseReviews({ items: [] })).toThrow("unexpected review list");
  expect(() => parseReviews([review, {}])).toThrow("unexpected review");
});

test("a decision needs a known choice and a reason unless it accepts", () => {
  const reason = { note: "Say what is missing or wrong, so the team knows what to do next." };
  expect(reviewError("accepted", "")).toBeNull();
  expect(reviewError("accepted", "x".repeat(2000))).toBeNull();
  expect(reviewError("rejected", "Because.")).toBeNull();
  expect(reviewError("more_evidence", "Link the pull request.")).toBeNull();
  expect(reviewError("rejected", "")).toEqual(reason);
  expect(reviewError("more_evidence", "")).toEqual(reason);
  expect(reviewError("accepted", "x".repeat(2001))).toEqual({ note: "Use 2,000 characters or fewer." });
  for (const decision of ["", "approved", "Accepted", "verified"]) {
    expect(reviewError(decision, "Because."), decision).toEqual({ decision: "Choose accept, reject, or request more evidence." });
  }
});

test("a decision is outdated when the version or the set of evidence links differs from what was reviewed", () => {
  const link = (id: string) => ({ id, kind: "issue", label: "#1", title: "t", state: "open" });
  const review = { requirementVersion: 2, evidence: [link("a"), link("b")] };
  expect(reviewOutdated(review, 2, ["b", "a"])).toEqual({ version: false, evidence: false });
  expect(reviewOutdated(review, 3, ["a", "b"])).toEqual({ version: true, evidence: false });
  expect(reviewOutdated(review, 2, ["a"])).toEqual({ version: false, evidence: true });
  expect(reviewOutdated(review, 2, ["a", "b", "c"])).toEqual({ version: false, evidence: true });
  expect(reviewOutdated(review, 2, ["a", "c"])).toEqual({ version: false, evidence: true });
  expect(reviewOutdated(review, 1, [])).toEqual({ version: true, evidence: true });
  expect(reviewOutdated({ requirementVersion: 1, evidence: [] }, 1, [])).toEqual({ version: false, evidence: false });

  expect(reviewedText({ requirementVersion: 1, evidence: [] })).toBe("Reviewed version 1 with no evidence links");
  expect(reviewedText({ requirementVersion: 2, evidence: [link("a")] })).toBe("Reviewed version 2 with 1 evidence link");
  expect(reviewedText(review)).toBe("Reviewed version 2 with 2 evidence links");
});
