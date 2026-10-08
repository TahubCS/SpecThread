import { expect, test } from "@playwright/test";
import { fieldError, parseProject, parseProjects, projectNameError } from "../../app/web/src/lib/projects";

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
