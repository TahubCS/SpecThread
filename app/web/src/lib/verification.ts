/**
 * The project's predefined verification (ADR-070, docs/API.md): one GitHub Actions workflow file
 * and its branch. `current` is false when it was set up for a repository that is no longer the
 * connected one.
 */
export type VerificationSettings = {
  configured: boolean; workflow: string | null; branch: string | null; configuredBy: string | null; configuredAt: string | null; current: boolean;
};

export const VERIFICATION_RESULTS = ["passed", "failed", "cancelled", "skipped", "neutral", "not_started"] as const;

/**
 * One run of the predefined verification for a requirement (ADR-070). `status` is "requested"
 * until GitHub lists the run, then "running", then "completed" with a `result`. `url` is the run's
 * page on GitHub, with its logs.
 */
export type VerificationRun = {
  id: string; requirementId: string; workflow: string; branch: string; status: "requested" | "running" | "completed";
  result: (typeof VERIFICATION_RESULTS)[number] | null; url: string | null; requestedBy: string; requestedAt: string;
  startedAt: string | null; completedAt: string | null; checkedAt: string | null;
};

export const VERIFICATION_WORKFLOW_PATTERN = /^[A-Za-z0-9._-]{1,100}\.ya?ml$/;

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isOptionalDate = (value: unknown) => value === null || isDate(value);
const isText = (value: unknown): value is string | null => value === null || typeof value === "string";

/** Validates the verification settings from an API response. Throws when the shape is not the documented one. */
export function parseVerificationSettings(value: unknown): VerificationSettings {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.configured !== "boolean" || !isText(item.workflow) || !isText(item.branch) ||
      !isText(item.configuredBy) || !isOptionalDate(item.configuredAt) || typeof item.current !== "boolean" ||
      (item.configured && (item.workflow === null || item.branch === null || item.configuredBy === null || item.configuredAt === null))) {
    throw new Error("The API returned unexpected verification settings.");
  }
  return {
    configured: item.configured, workflow: item.workflow, branch: item.branch, configuredBy: item.configuredBy,
    configuredAt: item.configuredAt as string | null, current: item.current,
  };
}

/** Validates a requirement's verification runs from an API response, newest first. Throws when the shape is not the documented one. */
export function parseVerificationRuns(value: unknown): VerificationRun[] {
  if (!Array.isArray(value)) throw new Error("The API returned unexpected verification runs.");
  return value.map(parseVerificationRun);
}

export function parseVerificationRun(value: unknown): VerificationRun {
  const item = value as Record<string, unknown> | null;
  if (typeof item !== "object" || item === null || typeof item.id !== "string" || typeof item.requirementId !== "string" ||
      typeof item.workflow !== "string" || typeof item.branch !== "string" ||
      (item.status !== "requested" && item.status !== "running" && item.status !== "completed") ||
      (item.status === "completed") !== VERIFICATION_RESULTS.includes(item.result as VerificationRun["result"] & string) ||
      (item.status !== "completed" && item.result !== null) ||
      (item.url !== null && (typeof item.url !== "string" || !item.url.startsWith("https://github.com/"))) ||
      typeof item.requestedBy !== "string" || !isDate(item.requestedAt) || !isOptionalDate(item.startedAt) ||
      !isOptionalDate(item.completedAt) || !isOptionalDate(item.checkedAt)) {
    throw new Error("The API returned unexpected verification runs.");
  }
  return {
    id: item.id, requirementId: item.requirementId, workflow: item.workflow, branch: item.branch, status: item.status,
    result: item.result as VerificationRun["result"], url: item.url as string | null, requestedBy: item.requestedBy, requestedAt: item.requestedAt,
    startedAt: item.startedAt as string | null, completedAt: item.completedAt as string | null, checkedAt: item.checkedAt as string | null,
  };
}

/** How a run's outcome reads: "Check passed" and "Check failed" in the product's words, never verified or proven. */
export function verificationRunText(run: Pick<VerificationRun, "status" | "result">): string {
  if (run.status === "requested") return "Requested";
  if (run.status === "running") return "Running";
  switch (run.result) {
    case "passed": return "Check passed";
    case "failed": return "Check failed";
    case "cancelled": return "Cancelled";
    case "skipped": return "Skipped";
    case "not_started": return "Not started";
    default: return "Finished without a result";
  }
}

/** Whether a requirement has a run GitHub hasn't finished, so another can't start yet. */
export function hasUnfinishedRun(runs: Pick<VerificationRun, "status">[]): boolean {
  return runs.some(run => run.status !== "completed");
}

/** The workflow file every project can start from: it runs only the predefined verification scenario. */
export const VERIFICATION_WORKFLOW_TEMPLATE = `name: SpecThread verification
run-name: SpecThread verification \${{ inputs.specthread_run }}
on:
  workflow_dispatch:
    inputs:
      specthread_run:
        description: The SpecThread run this is
        required: true
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      # The predefined scenario: change this path to the project's verification test.
      - run: npx playwright test tests/verification --reporter=line
`;
