import { expect, test, type APIRequestContext } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startFakeGitHub } from "../../scripts/test-github.mjs";
import { startApi } from "../support/api-process";

// The predefined Playwright verification run through GitHub Actions (ADR-070, US-15), called
// directly against a disposable PostgreSQL database and a local stand-in for GitHub.
const issuer = "http://127.0.0.1:5101";
const gitHub = "http://127.0.0.1:5140";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let fake: Server;
let nextId = 5000;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('admin','Admin','admin@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('reviewer','Reviewer','reviewer@example.invalid',true,now(),now()),
    ('observer','Observer','observer@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  fake = await startFakeGitHub({ port: 5140, appId: "890", publicKey: key.publicKey });
  api = await startApi(5139, {
    ConnectionStrings__Database: `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`,
    Auth__Issuer: issuer, GitHub__ApiBaseUrl: gitHub, GitHub__AppId: "890",
    GitHub__PrivateKey: String(key.privateKey.export({ type: "pkcs1", format: "pem" })),
  });
});
test.afterAll(async () => {
  api?.stop();
  await new Promise(resolve => fake ? fake.close(resolve) : resolve(undefined));
  await database?.stop();
});

async function as(request: APIRequestContext, sub: string) {
  const minted = await request.post(`${issuer}/sign`, { data: { claims: { sub } } });
  const headers = { authorization: `Bearer ${(await minted.json()).token}` };
  const url = (path: string) => `${api.baseURL}${path}`;
  return {
    get: (path: string) => request.get(url(path), { headers }),
    post: (path: string, data?: object) => request.post(url(path), { headers, data }),
    put: (path: string, data?: object) => request.put(url(path), { headers, data }),
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

/** A project with one requirement, every role, and a connected repository with the given workflows. */
async function setUp(request: APIRequestContext, workflows: object[] = [{ file: "specthread-verification.yml", name: "SpecThread verification" }]) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name: "Verify team" })).json();
  await database.pool.query(`INSERT INTO public.team_members (team_id,user_id,role) VALUES
    ($1,'admin','admin'),($1,'member','member'),($1,'reviewer','reviewer'),($1,'observer','observer')`, [team.id]);
  const project = await (await owner.post("/projects", { name: "Checkout", teamId: team.id })).json();
  const requirement = await (await owner.post(`/projects/${project.id}/requirements`, { title: "Guest checkout", acceptanceCriteria: ["Done"] })).json();
  const [installationId, repositoryId] = [nextId++, nextId++];
  await request.put(`${gitHub}/__github/users/seed-${installationId}`, { data: { installations: [{ id: installationId, repositories: [{ id: repositoryId, owner: "acme", name: "web" }] }] } });
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/workflows`, { data: { workflows } });
  await database.pool.query(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
    VALUES ($1,$2,$3,'acme','web',false,'owner')`, [project.id, installationId, repositoryId]);
  return { projectId: project.id as string, requirementId: requirement.id as string, repositoryId };
}

const runs = async (request: APIRequestContext, repositoryId: number) =>
  (await (await request.get(`${gitHub}/__github/repositories/${repositoryId}/runs`)).json()).runs as { id: number; head_branch: string; inputs: Record<string, string> }[];
const finish = (request: APIRequestContext, repositoryId: number, status: string, conclusion?: string) =>
  request.post(`${gitHub}/__github/repositories/${repositoryId}/runs/latest`, { data: { status, conclusion, updated_at: "2026-11-28T10:05:00Z" } });

test("an Owner or Admin sets up one existing workflow and branch, and every member reads the setting", async ({ request }) => {
  const { projectId } = await setUp(request, [{ file: "specthread-verification.yml" }, { file: "off.yml", active: false }]);
  const path = `/projects/${projectId}/verification`;
  expect(await (await (await as(request, "observer")).get(path)).json()).toEqual({
    configured: false, workflow: null, branch: null, configuredBy: null, configuredAt: null, current: false,
  });
  for (const [body, field, message] of [
    [{ workflow: "", branch: "main" }, "workflow", "Enter a value."],
    [{ workflow: "tests.sh", branch: "main" }, "workflow", "Enter the workflow's file name in .github/workflows, such as specthread-verification.yml."],
    [{ workflow: "../ci.yml", branch: "main" }, "workflow", "Enter the workflow's file name in .github/workflows, such as specthread-verification.yml."],
    [{ workflow: "specthread-verification.yml", branch: "my branch" }, "branch", "A branch name has no spaces."],
    [{ workflow: "missing.yml", branch: "main" }, "workflow", "GitHub has no workflow missing.yml in acme/web, or the SpecThread app can't read its Actions."],
  ] as const) {
    const response = await (await as(request, "owner")).put(path, body);
    expect(response.status(), JSON.stringify(body)).toBe(400);
    expect((await response.json()).errors[field][0]).toBe(message);
  }
  const disabled = await (await as(request, "owner")).put(path, { workflow: "off.yml", branch: "main" });
  expect(disabled.status()).toBe(409);
  expect((await disabled.json()).detail).toBe("The workflow off.yml is disabled on GitHub. Enable it there first.");
  for (const role of ["member", "reviewer", "observer"]) {
    expect((await (await as(request, role)).put(path, { workflow: "specthread-verification.yml", branch: "main" })).status(), role).toBe(403);
  }
  const saved = await (await as(request, "admin")).put(path, { workflow: " specthread-verification.yml ", branch: "main" });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ configured: true, workflow: "specthread-verification.yml", branch: "main", configuredBy: "admin", current: true });
  expect(await (await (await as(request, "reviewer")).get(path)).json()).toMatchObject({ configured: true, workflow: "specthread-verification.yml" });
  expect((await (await as(request, "outsider")).get(path)).status()).toBe(404);
  expect((await (await as(request, "member")).delete(path)).status()).toBe(403);
  expect((await (await as(request, "owner")).delete(path)).status()).toBe(204);
  expect((await (await (await as(request, "owner")).get(path)).json()).configured).toBe(false);
});

test("running starts only the predefined workflow with the run's ID, then stores its result, times, and log link", async ({ request }) => {
  const { projectId, requirementId, repositoryId } = await setUp(request);
  const runsPath = `/requirements/${requirementId}/verification-runs`;
  const member = await as(request, "member");
  // Nothing to run until it is set up.
  expect((await (await member.post(runsPath)).json()).detail).toBe("This project has no verification set up. An Owner or Admin sets it up in project settings.");
  await (await as(request, "owner")).put(`/projects/${projectId}/verification`, { workflow: "specthread-verification.yml", branch: "main" });

  const started = await member.post(runsPath, { workflow: "other.yml", tests: ["anything"] });
  expect(started.status()).toBe(201);
  const run = await started.json();
  expect(run).toMatchObject({ requirementId, workflow: "specthread-verification.yml", branch: "main", status: "requested", result: null, url: null, requestedBy: "member" });
  // The only input GitHub receives is the run's own ID: whatever else the caller sends is ignored.
  const dispatched = await runs(request, repositoryId);
  expect(dispatched).toHaveLength(1);
  expect(dispatched[0]).toMatchObject({ head_branch: "main", inputs: { specthread_run: `specthread-${run.id.replaceAll("-", "")}` } });

  // One run at a time per requirement.
  const second = await member.post(runsPath);
  expect(second.status()).toBe(409);
  expect((await second.json()).detail).toBe("A verification run for this requirement hasn't finished yet. Refresh it to read its result first.");

  // Refreshing reads it from GitHub: running, then completed with a failure.
  let listed = await (await member.post(`${runsPath}/refresh`)).json();
  expect(listed[0]).toMatchObject({ status: "running", result: null, url: "https://github.com/acme/repo/actions/runs/1" });
  await finish(request, repositoryId, "completed", "failure");
  listed = await (await member.post(`${runsPath}/refresh`)).json();
  expect(listed[0]).toMatchObject({ status: "completed", result: "failed", completedAt: "2026-11-28T10:05:00Z", url: "https://github.com/acme/repo/actions/runs/1" });
  expect(listed[0].startedAt).not.toBeNull();
  expect(listed[0].checkedAt).not.toBeNull();

  // A second run passes; the list keeps both, newest first, and every member reads it.
  const again = await (await member.post(runsPath)).json();
  await finish(request, repositoryId, "completed", "success");
  await member.post(`${runsPath}/refresh`);
  const all = await (await (await as(request, "observer")).get(runsPath)).json();
  expect(all.map((entry: { id: string; result: string }) => [entry.id, entry.result])).toEqual([[again.id, "passed"], [run.id, "failed"]]);
  expect((await (await as(request, "outsider")).get(runsPath)).status()).toBe(404);
  for (const role of ["reviewer", "observer"]) {
    expect((await (await as(request, role)).post(runsPath)).status(), role).toBe(403);
    expect((await (await as(request, role)).post(`${runsPath}/refresh`)).status(), role).toBe(403);
  }
});

test("a run GitHub won't start is kept as not started, and archived requirements or a changed repository refuse to run", async ({ request }) => {
  const { projectId, requirementId, repositoryId } = await setUp(request, [{ file: "specthread-verification.yml", branches: ["main"] }]);
  const owner = await as(request, "owner");
  const runsPath = `/requirements/${requirementId}/verification-runs`;
  await owner.put(`/projects/${projectId}/verification`, { workflow: "specthread-verification.yml", branch: "release" });
  const refused = await owner.post(runsPath);
  expect(refused.status()).toBe(409);
  expect((await refused.json()).detail).toMatch(/^GitHub didn't start specthread-verification\.yml on release\./);
  const [kept] = await (await owner.get(runsPath)).json();
  expect(kept).toMatchObject({ status: "completed", result: "not_started", url: null });
  expect(await runs(request, repositoryId)).toHaveLength(0);

  // GitHub failing is a 502, and the attempt is kept as not started.
  await owner.put(`/projects/${projectId}/verification`, { workflow: "specthread-verification.yml", branch: "main" });
  await request.post(`${gitHub}/__github/faults`, { data: { bearer: "installation", path: `^/repositories/${repositoryId}/actions/workflows/[^/]+/dispatches$`, status: 500, times: 1 } });
  expect((await owner.post(runsPath)).status()).toBe(502);
  expect((await (await owner.get(runsPath)).json()).map((entry: { result: string }) => entry.result)).toEqual(["not_started", "not_started"]);

  // Connecting a different repository makes the setting stale until it is set up again.
  await database.pool.query("UPDATE public.project_repositories SET repository_id = repository_id + 100 WHERE project_id = $1", [projectId]);
  expect((await (await owner.get(`/projects/${projectId}/verification`)).json()).current).toBe(false);
  expect((await (await owner.post(runsPath)).json()).detail).toBe(
    "The verification was set up for a repository that is no longer connected. An Owner or Admin must set it up again.");
  await database.pool.query("UPDATE public.project_repositories SET repository_id = repository_id - 100 WHERE project_id = $1", [projectId]);
  await owner.post(`/requirements/${requirementId}/archive`);
  expect((await owner.post(runsPath)).status()).toBe(409);
});

test("the migration protects both tables, constrains their rows, and rolls back only them", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count as number;
  for (const table of ["project_verifications", "verification_runs"]) {
    const { rows: [security] } = await database.pool.query(`SELECT relrowsecurity AS rls FROM pg_class WHERE relname = $1`, [table]);
    expect(security.rls, table).toBe(true);
    const { rows: grants } = await database.pool.query(`SELECT grantee FROM information_schema.role_table_grants
      WHERE table_name = $1 AND grantee IN ('anon','authenticated','PUBLIC')`, [table]);
    expect(grants, table).toEqual([]);
  }
  const { rows: [requirement] } = await database.pool.query("SELECT id FROM public.requirements LIMIT 1");
  const run = (status: string, result: string | null) => database.pool.query(
    `INSERT INTO public.verification_runs (requirement_id,repository_id,workflow,branch,status,result,requested_by) VALUES ($1,1,'v.yml','main',$2,$3,'owner')`,
    [requirement.id, status, result]);
  for (const [status, result] of [["finished", null], ["completed", null], ["running", "passed"], ["completed", "proven"]] as const) {
    await expect(run(status, result), `${status} ${result}`).rejects.toThrow(/check constraint/);
  }
  await run("completed", "passed");
  const { rows: [project] } = await database.pool.query("SELECT id FROM public.projects WHERE id NOT IN (SELECT project_id FROM public.project_verifications) LIMIT 1");
  for (const [workflow, branch] of [["../x.yml", "main"], ["x.sh", "main"], ["x.yml", "a b"]]) {
    await expect(database.pool.query(`INSERT INTO public.project_verifications (project_id,repository_id,workflow,branch,configured_by) VALUES ($1,1,$2,$3,'owner')`,
      [project.id, workflow, branch]), `${workflow} ${branch}`).rejects.toThrow(/check constraint/);
  }
  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  await database.pool.query(await readFile("docs/schema/project-verification-rollback.sql", "utf8"));
  expect(await count(`SELECT count(*)::int AS count FROM pg_tables WHERE tablename IN ('project_verifications','verification_runs')`)).toBe(0);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);
  await database.pool.query(await readFile("docs/schema/project-verification.sql", "utf8"));
});
