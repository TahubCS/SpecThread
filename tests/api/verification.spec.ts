import { expect, test } from "@playwright/test";
import {
  hasUnfinishedRun, parseVerificationRuns, parseVerificationSettings, VERIFICATION_WORKFLOW_PATTERN, VERIFICATION_WORKFLOW_TEMPLATE,
  verificationRunText,
} from "../../app/web/src/lib/verification";

// The predefined verification's parsing and wording (ADR-070, US-15), without a browser.

const settings = { configured: true, workflow: "specthread-verification.yml", branch: "main", configuredBy: "u1", configuredAt: "2026-11-28T10:00:00Z", current: true };
const run = {
  id: "v1", requirementId: "r1", workflow: "specthread-verification.yml", branch: "main", status: "completed", result: "passed",
  url: "https://github.com/acme/web/actions/runs/7", requestedBy: "u1", requestedAt: "2026-11-28T10:00:00Z",
  startedAt: "2026-11-28T10:00:05Z", completedAt: "2026-11-28T10:04:00Z", checkedAt: "2026-11-28T10:05:00Z",
};

test("settings and runs are accepted only in the documented shape", () => {
  expect(parseVerificationSettings(settings)).toEqual(settings);
  const none = { configured: false, workflow: null, branch: null, configuredBy: null, configuredAt: null, current: false };
  expect(parseVerificationSettings(none)).toEqual(none);
  for (const value of [null, {}, { ...settings, workflow: null }, { ...settings, configured: "yes" }, { ...settings, configuredAt: "soon" }]) {
    expect(() => parseVerificationSettings(value), JSON.stringify(value)).toThrow("unexpected verification settings");
  }
  expect(parseVerificationRuns([{ ...run, extra: 1 }])).toEqual([run]);
  const requested = { ...run, status: "requested", result: null, url: null, startedAt: null, completedAt: null, checkedAt: null };
  expect(parseVerificationRuns([requested])[0].status).toBe("requested");
  for (const value of [{ ...run, status: "done" }, { ...run, result: null }, { ...requested, result: "passed" }, { ...run, result: "proven" },
    { ...run, url: "https://evil.example/run" }, { ...run, requestedAt: "soon" }, { ...run, completedAt: 5 }]) {
    expect(() => parseVerificationRuns([value]), JSON.stringify(value)).toThrow("unexpected verification runs");
  }
  expect(() => parseVerificationRuns({})).toThrow("unexpected verification runs");
});

test("runs read in the product's words, and only workflow file names are accepted", () => {
  const text = (status: string, result: string | null) => verificationRunText({ status, result } as never);
  expect(text("requested", null)).toBe("Requested");
  expect(text("running", null)).toBe("Running");
  expect(text("completed", "passed")).toBe("Check passed");
  expect(text("completed", "failed")).toBe("Check failed");
  expect(text("completed", "cancelled")).toBe("Cancelled");
  expect(text("completed", "not_started")).toBe("Not started");
  expect(text("completed", "neutral")).toBe("Finished without a result");
  expect(hasUnfinishedRun([{ status: "completed" }, { status: "running" }])).toBe(true);
  expect(hasUnfinishedRun([{ status: "completed" }])).toBe(false);
  for (const name of ["specthread-verification.yml", "verify.yaml", "a.b_c-d.yml"]) expect(VERIFICATION_WORKFLOW_PATTERN.test(name), name).toBe(true);
  for (const name of ["", "verify.sh", "../ci.yml", ".github/workflows/x.yml", "x .yml"]) expect(VERIFICATION_WORKFLOW_PATTERN.test(name), name).toBe(false);
  // The template takes the one input SpecThread sends and puts it in the run name, so the run can be found.
  expect(VERIFICATION_WORKFLOW_TEMPLATE).toContain("run-name: SpecThread verification ${{ inputs.specthread_run }}");
  expect(VERIFICATION_WORKFLOW_TEMPLATE).toContain("workflow_dispatch:");
  expect(VERIFICATION_WORKFLOW_TEMPLATE).toContain("specthread_run:");
});
