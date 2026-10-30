import { expect, test } from "@playwright/test";
import {
  fieldError, formatDate, isUuid, parseMembers, parseMilestones, parseProject, parseProjects, parseRequirementSummaries, projectNameError,
  requirementCounts,
} from "../../app/web/src/lib/projects";
import {
  criteriaChanged, documentChoices, milestoneError, moveItem, parseRequirement, readMilestoneInput, readRequirementInput, requirementErrors, requirementProblemErrors,
} from "../../app/web/src/lib/requirements";
import { criteriaVersionText, parseCriteriaVersion, parseCriteriaVersions } from "../../app/web/src/lib/criteria-versions";
import { followUpEventText, parseFollowUps } from "../../app/web/src/lib/follow-ups";
import {
  checkSummary, evidenceChanges, evidenceCountText, evidenceEventText, evidenceLabel, evidenceReferenceError, parseEvidence, parseEvidenceHistory,
  parseEvidenceList, parseEvidenceSearch, problemDetail,
  releaseContents, releasesContaining,
} from "../../app/web/src/lib/evidence";
import { parseAvailableRepositories, parseProjectRepository, parseRepositoryChoice } from "../../app/web/src/lib/repositories";
import {
  isAccepted, parseReview, parseReviews, parseReviewSummary, reviewedText, reviewError, reviewOutdated, reviewStatus,
} from "../../app/web/src/lib/reviews";

const project = { id: "p1", name: "Billing", ownerUserId: "u1", createdAt: "2026-10-01T10:00:00.123456Z", archivedAt: null,
  teamId: "t1", teamName: "Payments", teamRole: "admin" };

test("project responses are accepted only in the documented shape", () => {
  expect(parseProject({ ...project, extra: true })).toEqual(project);
  expect(parseProjects([project, { ...project, archivedAt: "2026-10-02T00:00:00Z" }])).toHaveLength(2);
  for (const value of [null, "text", {}, { ...project, id: 1 }, { ...project, name: undefined },
    { ...project, createdAt: "yesterday" }, { ...project, archivedAt: 0 }, { ...project, teamId: undefined }, { ...project, teamName: 1 },
    { ...project, teamRole: "viewer" }, { ...project, teamRole: undefined }]) {
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
    createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", archivedAt: null, evidenceCount: 3, review: null,
    milestone: "Sprint 3", criteriaVersion: 2, evidenceComplete: true };
  expect(parseRequirementSummaries([{ ...requirement, description: "ignored" }])).toEqual([requirement]);
  // The previous API (ADR-044) sends none of the milestone, criteria version, or evidence rule fields.
  const previous: Record<string, unknown> = { ...requirement };
  for (const field of ["milestone", "criteriaVersion", "evidenceComplete"]) delete previous[field];
  expect(parseRequirementSummaries([previous])).toEqual([{ ...previous, milestone: null, criteriaVersion: null, evidenceComplete: false }]);
  for (const value of [{ milestone: "" }, { milestone: 3 }, { criteriaVersion: 0 }, { criteriaVersion: "2" }, { evidenceComplete: "yes" }, { evidenceComplete: null }]) {
    expect(() => parseRequirementSummaries([{ ...requirement, ...value }]), JSON.stringify(value)).toThrow("unexpected requirement");
  }
  expect(parseRequirementSummaries([{ ...requirement, evidenceCount: 0 }])[0].evidenceCount).toBe(0);
  for (const evidenceCount of [undefined, null, "3", -1, 1.5]) {
    expect(() => parseRequirementSummaries([{ ...requirement, evidenceCount }]), String(evidenceCount)).toThrow("unexpected requirement");
  }
  expect(evidenceCountText(0)).toBe("No evidence");
  expect(evidenceCountText(1)).toBe("1 evidence link");
  expect(evidenceCountText(12)).toBe("12 evidence links");
  const review = { decision: "more_evidence", decidedBy: "u2", decidedAt: "2026-10-03T10:00:00Z", outdated: true, criteriaChanged: false, criteriaVersion: 2 };
  expect(parseRequirementSummaries([{ ...requirement, review: { ...review, note: "ignored" } }])).toEqual([{ ...requirement, review }]);
  const previousReview: Record<string, unknown> = { ...review };
  delete previousReview.criteriaChanged;
  delete previousReview.criteriaVersion;
  expect(parseReviewSummary(previousReview)).toEqual({ ...previousReview, criteriaChanged: false, criteriaVersion: null });
  for (const value of [undefined, "accepted", {}, { ...review, decision: "verified" }, { ...review, outdated: "no" }, { ...review, decidedAt: "soon" }, { ...review, decidedBy: 1 },
    { ...review, criteriaChanged: "yes" }, { ...review, criteriaVersion: 0 }]) {
    expect(() => parseRequirementSummaries([{ ...requirement, review: value }]), JSON.stringify(value)).toThrow("unexpected review");
  }
  for (const value of [null, {}, [null], [{ ...requirement, version: "2" }], [{ ...requirement, updatedAt: "soon" }], [{ ...requirement, title: 1 }]]) {
    expect(() => parseRequirementSummaries(value)).toThrow("unexpected requirement");
  }

  expect(parseMilestones(["Sprint 1", "Sprint 2"])).toEqual(["Sprint 1", "Sprint 2"]);
  for (const value of [null, {}, [""], [1]]) expect(() => parseMilestones(value)).toThrow("unexpected milestone list");

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
  const document = { id: "d1", title: "Design the Box", fileName: "box.pdf", contentType: "application/pdf", archivedAt: null,
    linkedBy: "u1", linkedAt: "2026-10-01T10:00:00Z" };
  const requirement = { id: "r1", projectId: "p1", title: "Guest checkout", description: "", createdBy: "u1", updatedBy: "u2", version: 2,
    createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z", archivedAt: null,
    acceptanceCriteria: [{ id: "c2", text: "Second", position: 1 }, { id: "c1", text: "First", position: 0 }],
    documents: [{ ...document, extra: 1 }] };
  const parsed = parseRequirement(requirement);
  expect(parsed).toMatchObject({ criteriaVersion: null, milestone: null });
  expect(parseRequirement({ ...requirement, criteriaVersion: 4, milestone: "Sprint 3" })).toMatchObject({ criteriaVersion: 4, milestone: "Sprint 3" });
  for (const value of [{ criteriaVersion: 0 }, { criteriaVersion: "4" }, { milestone: "" }, { milestone: 5 }]) {
    expect(() => parseRequirement({ ...requirement, ...value }), JSON.stringify(value)).toThrow("unexpected requirement");
  }
  expect(parsed.acceptanceCriteria.map(criterion => criterion.text)).toEqual(["First", "Second"]);
  expect(parsed.createdAt).toBe("2026-10-01T10:00:00Z");
  expect(parsed.updatedBy).toBe("u2");
  expect(parsed.documents).toEqual([document]);
  for (const value of [null, {}, { ...requirement, description: null }, { ...requirement, createdBy: 1 },
    { ...requirement, acceptanceCriteria: null }, { ...requirement, version: "2" }, { ...requirement, documents: null },
    { ...requirement, updatedBy: null }, { ...requirement, updatedBy: undefined, createdBy: 1 }]) {
    expect(() => parseRequirement(value)).toThrow("unexpected requirement");
  }
  // The previous API sends neither field; the page reads them as the creator and no documents.
  const previous: Record<string, unknown> = { ...requirement };
  delete previous.updatedBy;
  delete previous.documents;
  expect(parseRequirement(previous)).toMatchObject({ updatedBy: "u1", documents: [] });
  expect(() => parseRequirement({ ...requirement, acceptanceCriteria: [{ id: "c", text: 1, position: 0 }] })).toThrow("unexpected acceptance criterion");
  for (const value of [null, { ...document, title: 1 }, { ...document, archivedAt: "soon" }, { ...document, linkedBy: null }]) {
    expect(() => parseRequirement({ ...requirement, documents: [value] }), JSON.stringify(value)).toThrow("unexpected linked document");
  }
});

test("the form offers active documents, then linked ones archived since", () => {
  const active = [{ id: "d1", title: "Brief", contentType: "application/pdf" }];
  const linked = (id: string, archivedAt: string | null) => ({ id, title: id, fileName: `${id}.pdf`, contentType: "application/pdf",
    archivedAt, linkedBy: "u1", linkedAt: "2026-10-01T10:00:00Z" });
  expect(documentChoices(active, [linked("d1", null), linked("d2", "2026-10-02T10:00:00Z")])).toEqual([
    { id: "d1", title: "Brief", contentType: "application/pdf", archived: false },
    { id: "d2", title: "d2", contentType: "application/pdf", archived: true },
  ]);
  expect(documentChoices([], [])).toEqual([]);
});

test("requirement input is trimmed and checked against the API limits", () => {
  const form = new FormData();
  form.set("title", "  Guest checkout  ");
  form.set("description", "  Buy without an account.  ");
  form.append("criteria", " First ");
  form.append("criteria", "   ");
  form.append("documents", "d1");
  form.append("documents", "");
  const input = readRequirementInput(form);
  expect(input).toEqual({ title: "Guest checkout", description: "Buy without an account.", criteria: ["First", ""], documentIds: ["d1"] });
  expect(requirementErrors(input)).toEqual({ items: { 1: "Enter the criterion or remove it." } });
  expect(requirementErrors({ title: "T", description: "", criteria: ["Done"], documentIds: [] })).toBeNull();
  expect(requirementErrors({ title: "T", description: "", criteria: [], documentIds: [] }))
    .toEqual({ criteria: "Add at least one acceptance criterion.", items: {} });
  expect(requirementErrors({ title: "x".repeat(200), description: "x".repeat(10_000), criteria: Array(50).fill("x".repeat(2_000)),
    documentIds: Array.from({ length: 20 }, (_, index) => `d${index}`) })).toBeNull();
  expect(requirementErrors({ title: "", description: "x".repeat(10_001), criteria: Array(51).fill("ok").concat("x".repeat(2_001)),
    documentIds: Array.from({ length: 21 }, (_, index) => `d${index}`) })).toEqual({
    title: "Enter a title.", description: "Use 10,000 characters or fewer.", criteria: "Use 50 acceptance criteria or fewer.",
    documents: "Link 20 documents or fewer.", items: { 51: "Use 2,000 characters or fewer." },
  });
  expect(requirementErrors({ title: "x".repeat(201), description: "", criteria: ["Done"], documentIds: [] })?.title).toBe("Use 200 characters or fewer.");
  expect(readRequirementInput(new FormData())).toEqual({ title: "", description: "", criteria: [], documentIds: [] });
});

test("requirement validation problems are mapped to their fields", () => {
  expect(requirementProblemErrors({ errors: {
    title: ["Enter a value."], description: ["Too long."], acceptanceCriteria: ["Too many."], "acceptanceCriteria[2]": ["Enter a value."],
    documentIds: ["Link each document once."],
  } }, "Failed")).toEqual({
    title: "Enter a value.", description: "Too long.", criteria: "Too many.", documents: "Link each document once.", items: { 2: "Enter a value." },
  });
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
  const review = { id: "v1", requirementId: "r1", decision: "rejected", note: "Cart is emptied.", requirementVersion: 3, criteriaVersion: 2,
    evidence: [link, { ...link, id: "e2", kind: "commit", label: "abc1234", state: null }], decidedBy: "u2", decidedAt: "2026-10-03T10:00:00Z" };
  expect(parseReview({ ...review, extra: 1, evidence: review.evidence.map(entry => ({ ...entry, extra: 1 })) })).toEqual(review);
  // Not recorded: decided before criteria versions were kept, or by the previous API, which sends no field.
  expect(parseReview({ ...review, criteriaVersion: null }).criteriaVersion).toBeNull();
  const previous: Record<string, unknown> = { ...review };
  delete previous.criteriaVersion;
  expect(parseReview(previous).criteriaVersion).toBeNull();
  expect(parseReviews([review, { ...review, decision: "accepted", note: "", evidence: [] }])).toHaveLength(2);
  expect(parseReviewSummary(null)).toBeNull();
  for (const value of [null, "text", {}, { ...review, decision: "verified" }, { ...review, note: null }, { ...review, requirementVersion: 0 },
    { ...review, requirementVersion: 1.5 }, { ...review, requirementVersion: "3" }, { ...review, evidence: null }, { ...review, evidence: [null] },
    { ...review, evidence: [{ ...link, state: 1 }] }, { ...review, evidence: [{ ...link, label: undefined }] }, { ...review, decidedAt: "soon" }, { ...review, decidedBy: 2 },
    { ...review, criteriaVersion: 0 }, { ...review, criteriaVersion: "2" }]) {
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

test("an item is moved within a list, and an impossible move changes nothing", () => {
  const list = ["a", "b", "c", "d"];
  expect(moveItem(list, 0, 1)).toEqual(["b", "a", "c", "d"]);
  expect(moveItem(list, 3, 2)).toEqual(["a", "b", "d", "c"]);
  expect(moveItem(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
  expect(moveItem(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
  expect(list).toEqual(["a", "b", "c", "d"]);
  for (const [from, to] of [[0, -1], [3, 4], [-1, 0], [4, 0], [1, 1], [0.5, 1], [0, Number.NaN]]) {
    expect(moveItem(list, from, to), `${from} to ${to}`).toBe(list);
  }
  expect(moveItem([], 0, 0)).toEqual([]);
});

test("a listed requirement needs review when its criteria changed after the decision, and counts as Accepted only when current", () => {
  const review = { decision: "accepted" as const, decidedBy: "u2", decidedAt: "2026-10-03T10:00:00Z", outdated: false, criteriaChanged: false, criteriaVersion: 1 };
  expect(reviewStatus(null)).toEqual({ text: "Not reviewed", tone: null, outdated: false });
  expect(reviewStatus(review)).toEqual({ text: "Accepted", tone: "accepted", outdated: false });
  expect(reviewStatus({ ...review, outdated: true })).toEqual({ text: "Accepted, outdated", tone: "accepted", outdated: true });
  expect(reviewStatus({ ...review, outdated: true, criteriaChanged: true })).toEqual({ text: "Needs review", tone: "needs-review", outdated: false });
  expect(isAccepted(review)).toBe(true);
  for (const value of [null, { ...review, outdated: true }, { ...review, criteriaChanged: true }, { ...review, decision: "rejected" as const }]) {
    expect(isAccepted(value), JSON.stringify(value)).toBe(false);
  }

  const requirements = [
    { evidenceComplete: true, review },
    { evidenceComplete: true, review: { ...review, criteriaChanged: true, outdated: true } },
    { evidenceComplete: false, review },
    { evidenceComplete: false, review: null },
  ];
  expect(requirementCounts(requirements)).toEqual({ total: 4, evidenceComplete: 2, accepted: 2 });
  expect(requirementCounts([])).toEqual({ total: 0, evidenceComplete: 0, accepted: 0 });
});

test("changed criteria are detected as the API compares them, and milestones are optional and limited", () => {
  expect(criteriaChanged(["First", "Second"], [" First ", "Second"])).toBe(false);
  expect(criteriaChanged(["First", "Second"], ["Second", "First"])).toBe(true);
  expect(criteriaChanged(["First", "Second"], ["First"])).toBe(true);
  expect(criteriaChanged(["First"], ["First", "Third"])).toBe(true);
  expect(criteriaChanged(["First"], ["first"])).toBe(true);

  expect(milestoneError("")).toBeNull();
  expect(milestoneError("x".repeat(100))).toBeNull();
  expect(milestoneError("x".repeat(101))).toBe("Use 100 characters or fewer.");
  const milestoneForm = (entries: [string, string | Blob][]) => {
    const data = new FormData();
    for (const [name, value] of entries) data.append(name, value);
    return data;
  };
  expect(readMilestoneInput(milestoneForm([["intent", "save"], ["milestone", "  Sprint 2 "]]))).toBe("Sprint 2");
  expect(readMilestoneInput(milestoneForm([["intent", "save"], ["milestone", "   "]]))).toBe("");
  // Clear ignores the field, whatever it holds.
  for (const value of ["Sprint 2", new Blob(["x"])]) {
    expect(readMilestoneInput(milestoneForm([["intent", "clear"], ["milestone", value]]))).toBe("");
  }
  // A missing field or a file is refused rather than read as text.
  expect(readMilestoneInput(milestoneForm([["intent", "save"]]))).toBeNull();
  expect(readMilestoneInput(milestoneForm([["intent", "save"], ["milestone", new Blob(["Sprint 2"])]]))).toBeNull();
  const form = new FormData();
  form.set("title", "Guest checkout");
  form.append("criteria", "Done");
  expect(readRequirementInput(form)).not.toHaveProperty("milestone");
  form.set("milestone", "  Sprint 3  ");
  expect(readRequirementInput(form).milestone).toBe("Sprint 3");
  form.set("milestone", "x".repeat(101));
  expect(requirementErrors(readRequirementInput(form))).toEqual({ items: {}, milestone: "Use 100 characters or fewer." });
  expect(requirementProblemErrors({ errors: { milestone: ["Use at most 100 characters."] } }, "Failed"))
    .toEqual({ items: {}, milestone: "Use at most 100 characters." });
});

test("criteria versions and follow-ups are accepted only in the documented shape", () => {
  const version = { number: 2, criteria: ["First", "Second"], createdBy: "u1", createdAt: "2026-10-01T10:00:00Z" };
  expect(parseCriteriaVersion({ ...version, extra: 1 })).toEqual(version);
  expect(parseCriteriaVersions([version, { ...version, number: 1, criteria: [] }])).toHaveLength(2);
  for (const value of [null, {}, { ...version, number: 0 }, { ...version, criteria: [1] }, { ...version, criteria: null },
    { ...version, createdBy: 1 }, { ...version, createdAt: "soon" }]) {
    expect(() => parseCriteriaVersion(value), JSON.stringify(value)).toThrow("unexpected criteria version");
  }
  expect(() => parseCriteriaVersions({})).toThrow("unexpected criteria version list");
  expect(criteriaVersionText(3)).toBe("Criteria version 3");
  expect(criteriaVersionText(null)).toBe("Criteria version not recorded");

  const link = { requirementId: "r2", title: "Box opens", archivedAt: null, linkedBy: "u1", linkedAt: "2026-10-01T10:00:00Z" };
  const event = { id: "e1", requirementId: "r1", requirementTitle: "Box opens faster", originalRequirementId: "r2", originalTitle: "Box opens",
    action: "added", actor: "u1", occurredAt: "2026-10-01T10:00:00Z" };
  const followUps = { followUpOf: [link], followedUpBy: [], history: [event, { ...event, id: "e2", action: "removed" }] };
  expect(parseFollowUps({ ...followUps, extra: 1 })).toEqual(followUps);
  for (const value of [null, {}, { ...followUps, history: null }, { ...followUps, followUpOf: [{ ...link, linkedAt: "soon" }] },
    { ...followUps, followedUpBy: [{ ...link, title: null }] }, { ...followUps, history: [{ ...event, action: "renamed" }] }]) {
    expect(() => parseFollowUps(value), JSON.stringify(value)).toThrow(/unexpected follow-up/);
  }
  expect(followUpEventText(parseFollowUps(followUps).history[0], "r1")).toBe("Marked as a follow-up of “Box opens”");
  expect(followUpEventText(parseFollowUps(followUps).history[1], "r2")).toBe("“Box opens faster” was unmarked as a follow-up of this requirement");
});

test("title search results and the evidence history are accepted only in the documented shape", () => {
  const result = { number: 15, kind: "pull_request", title: "Add guest checkout", state: "merged", author: "grace",
    url: "https://github.com/acme/web/pull/15", linked: false };
  expect(parseEvidenceSearch({ items: [{ ...result, extra: 1 }, { ...result, number: 3, author: null }] })).toEqual([result, { ...result, number: 3, author: null }]);
  expect(parseEvidenceSearch({ items: [] })).toEqual([]);
  for (const value of [null, [], { items: null }, { items: [{ ...result, number: 0 }] }, { items: [{ ...result, kind: "commit" }] },
    { items: [{ ...result, state: "draft" }] }, { items: [{ ...result, url: "https://evil.example/acme/web/pull/15" }] },
    { items: [{ ...result, linked: "no" }] }, { items: [{ ...result, author: 1 }] }]) {
    expect(() => parseEvidenceSearch(value), JSON.stringify(value)).toThrow("unexpected search results");
  }

  const event = { id: "v1", evidenceId: "e1", action: "removed" as const, kind: "commit", label: "4f2a9c1", title: "Fix totals", actor: "u1",
    occurredAt: "2026-10-30T10:00:00Z" };
  expect(parseEvidenceHistory([{ ...event, extra: 1 }])).toEqual([event]);
  for (const value of [null, {}, [{ ...event, action: "renamed" }], [{ ...event, kind: "deployment" }], [{ ...event, label: 1 }],
    [{ ...event, actor: null }], [{ ...event, occurredAt: "soon" }]]) {
    expect(() => parseEvidenceHistory(value), JSON.stringify(value)).toThrow("unexpected evidence history");
  }
  expect(evidenceEventText(event)).toBe("Removed 4f2a9c1 “Fix totals”");
  expect(evidenceEventText({ ...event, action: "added" as const, label: "#15", title: "Add guest checkout" })).toBe("Linked #15 “Add guest checkout”");
});
