import { expect, test } from "@playwright/test";
import {
  fieldError, formatDate, isUuid, parseMembers, parseProject, parseProjects, parseRequirementSummaries, projectNameError,
} from "../../app/web/src/lib/projects";
import {
  parseRequirement, readRequirementInput, requirementErrors, requirementProblemErrors,
} from "../../app/web/src/lib/requirements";

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
