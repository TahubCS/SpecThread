import { expect, test } from "@playwright/test";
import {
  fieldError, formatDate, isUuid, parseMembers, parseProject, parseProjects, parseRequirementSummaries, projectNameError,
} from "../../app/web/src/lib/projects";
import {
  parseRequirement, readRequirementInput, requirementErrors, requirementProblemErrors,
} from "../../app/web/src/lib/requirements";
import {
  checkSummary, evidenceChanges, evidenceLabel, evidenceReferenceError, parseEvidence, parseEvidenceList, problemDetail,
} from "../../app/web/src/lib/evidence";
import { parseAvailableRepositories, parseProjectRepository, parseRepositoryChoice } from "../../app/web/src/lib/repositories";

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
    createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", archivedAt: null };
  expect(parseRequirementSummaries([{ ...requirement, description: "ignored" }])).toEqual([requirement]);
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
  const evidence = { id: "e1", requirementId: "r1", kind: "pull_request", number: 5, sha, title: "Add guest checkout", state: "merged",
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
  expect(evidenceReferenceError("")).toBe("Enter an issue or pull request number, a commit SHA, or a GitHub link to one of them.");
  expect(evidenceReferenceError("x".repeat(301))).toBe("Use 300 characters or fewer.");
  expect(evidenceLabel({ number: 5, sha })).toBe("#5");
  expect(evidenceLabel({ number: null, sha })).toBe("aaaaaaa");
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
