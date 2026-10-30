import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// Milestone labels, the milestone filter, and the built-in Evidence complete rule (ADR-053),
// against a disposable PostgreSQL database. Evidence links are inserted as rows, so GitHub is not involved.
const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let nextNumber = 1;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  api = await startApi(5123, {
    ConnectionStrings__Database: `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`,
    Auth__Issuer: issuer,
  });
});
test.afterAll(async () => {
  api?.stop();
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
  };
}

/** A project of the owner's team, where "member" is a member. */
async function createProject(request: APIRequestContext) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name: "Box team" })).json();
  const project = await (await owner.post("/projects", { name: "Box", teamId: team.id })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query("INSERT INTO public.team_members (team_id,user_id) VALUES ($1,'member')", [team.id]);
  return project.id as string;
}

async function createRequirement(request: APIRequestContext, projectId: string, title: string, milestone?: string | null) {
  const created = await (await as(request, "owner")).post(`/projects/${projectId}/requirements`, { title, acceptanceCriteria: ["Done"], milestone });
  expect(created.status()).toBe(201);
  return created.json();
}

test("a requirement has at most one label, set on create or later without changing its version", async ({ request }) => {
  const projectId = await createProject(request);
  const requirement = await createRequirement(request, projectId, "Box opens", "  Sprint 1 ");
  expect(requirement.milestone).toBe("Sprint 1");
  expect((await createRequirement(request, projectId, "Box closes", "   ")).milestone).toBeNull();
  const member = await as(request, "member");
  const path = `/requirements/${requirement.id}`;

  const set = await member.put(`${path}/milestone`, { milestone: " Sprint 2 " });
  expect(set.status()).toBe(200);
  expect(await set.json()).toEqual({ milestone: "Sprint 2" });
  // Not an edit: the version and last editor stay, so a decision does not become outdated.
  expect(await (await member.get(path)).json()).toMatchObject({
    milestone: "Sprint 2", version: 1, updatedBy: "owner", updatedAt: requirement.updatedAt,
  });
  for (const milestone of [null, ""]) {
    expect(await (await member.put(`${path}/milestone`, { milestone })).json()).toEqual({ milestone: null });
  }

  const tooLong = await member.put(`${path}/milestone`, { milestone: "x".repeat(101) });
  expect(tooLong.status()).toBe(400);
  expect((await tooLong.json()).errors.milestone).toEqual(["Use at most 100 characters."]);
  const created = await (await as(request, "owner")).post(`/projects/${projectId}/requirements`, { title: "Long", acceptanceCriteria: ["Done"], milestone: "x".repeat(101) });
  expect(created.status()).toBe(400);
  expect((await created.json()).errors.milestone).toEqual(["Use at most 100 characters."]);

  expect((await (await as(request, "outsider")).put(`${path}/milestone`, { milestone: "Sprint 9" })).status()).toBe(404);
  expect((await request.put(`${api.baseURL}${path}/milestone`, { data: { milestone: "Sprint 9" } })).status()).toBe(401);
  expect((await member.post(`${path}/archive`)).status()).toBe(200);
  expect((await member.put(`${path}/milestone`, { milestone: "Sprint 9" })).status()).toBe(409);
  expect((await member.get(path)).ok()).toBe(true);
});

test("the list filters by an exact label, and the labels in use are listed in order", async ({ request }) => {
  const projectId = await createProject(request);
  const member = await as(request, "member");
  const list = async (query = "") => (await (await member.get(`/projects/${projectId}/requirements${query}`)).json())
    .map((r: { title: string; milestone: string | null }) => [r.title, r.milestone]);
  await createRequirement(request, projectId, "A", "Sprint 2");
  await createRequirement(request, projectId, "B", "Sprint 1");
  await createRequirement(request, projectId, "C", "Sprint 2");
  await createRequirement(request, projectId, "D");
  const archived = await createRequirement(request, projectId, "E", "Sprint 3");
  expect((await member.post(`/requirements/${archived.id}/archive`)).status()).toBe(200);

  expect(await list()).toEqual([["A", "Sprint 2"], ["B", "Sprint 1"], ["C", "Sprint 2"], ["D", null]]);
  expect(await list("?milestone=Sprint%202")).toEqual([["A", "Sprint 2"], ["C", "Sprint 2"]]);
  expect(await list("?milestone=%20Sprint%202%20")).toEqual([["A", "Sprint 2"], ["C", "Sprint 2"]]);
  expect(await list("?milestone=sprint%202")).toEqual([]);
  expect(await list("?milestone=")).toHaveLength(4);
  expect(await list("?archived=true&milestone=Sprint%203")).toEqual([["E", "Sprint 3"]]);
  expect(await list("?milestone=Sprint%203")).toEqual([]);

  expect(await (await member.get(`/projects/${projectId}/milestones`)).json()).toEqual(["Sprint 1", "Sprint 2"]);
  expect((await (await as(request, "outsider")).get(`/projects/${projectId}/milestones`)).status()).toBe(404);
  expect((await request.get(`${api.baseURL}/projects/${projectId}/milestones`)).status()).toBe(401);
});

test("a requirement is Evidence complete only when its linked code has readable checks that all passed or were skipped", async ({ request }) => {
  const projectId = await createProject(request);
  const check = (result: string) => ({ name: `ci-${result}`, result, url: null, completedAt: null, kind: "check" });
  const link = async (requirementId: string, kind: "issue" | "pull_request" | "commit" | "release", checks: unknown) => {
    const number = nextNumber++;
    const identity = kind === "commit" ? { sha: number.toString(16).padStart(40, "0") }
      : kind === "release" ? { tag: `v${number}` } : { number, state: "open" };
    const row = { requirement_id: requirementId, kind, repository_id: 1, repository_owner: "acme", repository_name: "box", title: "t",
      url: "https://github.com/acme/box", github_created_at: new Date(), github_updated_at: new Date(), linked_by: "owner",
      checks: checks === null ? null : JSON.stringify(checks), ...identity };
    const names = Object.keys(row);
    await database.pool.query(`INSERT INTO public.requirement_evidence (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
  };
  const cases: [string, [Parameters<typeof link>[1], unknown][], boolean][] = [
    ["no evidence", [], false],
    ["only an issue", [["issue", null]], false],
    ["unreadable checks", [["pull_request", null]], false],
    ["no checks", [["pull_request", []]], false],
    ["only skipped", [["pull_request", [check("skipped")]]], false],
    ["passed", [["pull_request", [check("passed")]]], true],
    ["passed, skipped, and neutral, with a release and an issue", [["pull_request", [check("passed"), check("skipped")]], ["commit", [check("neutral")]], ["release", null], ["issue", null]], true],
    ["one failed", [["pull_request", [check("passed")]], ["commit", [check("failed")]]], false],
    ["one running", [["pull_request", [check("passed"), check("running")]]], false],
    ["one cancelled", [["commit", [check("passed"), check("cancelled")]]], false],
    ["one unreadable", [["pull_request", [check("passed")]], ["commit", null]], false],
  ];
  for (const [title, links] of cases) {
    const requirement = await createRequirement(request, projectId, title, "Sprint 1");
    for (const [kind, checks] of links) await link(requirement.id, kind, checks);
  }
  const listed = await (await (await as(request, "member")).get(`/projects/${projectId}/requirements?milestone=Sprint%201`)).json();
  expect(Object.fromEntries(listed.map((r: { title: string; evidenceComplete: boolean }) => [r.title, r.evidenceComplete])))
    .toEqual(Object.fromEntries(cases.map(([title, , complete]) => [title, complete])));
});

test("the migration constrains labels, and its rollback removes only the column", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  const { rows: [requirement] } = await database.pool.query("SELECT id FROM public.requirements ORDER BY created_at LIMIT 1");
  for (const milestone of ["", " Sprint 1", "Sprint 1 ", "x".repeat(101)]) {
    await expect(database.pool.query("UPDATE public.requirements SET milestone = $1 WHERE id = $2", [milestone, requirement.id]), JSON.stringify(milestone))
      .rejects.toThrow(/check constraint|too long/);
  }
  await database.pool.query("UPDATE public.requirements SET milestone = 'Sprint 1' WHERE id = $1", [requirement.id]);

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  const requirements = await count("SELECT count(*)::int AS count FROM public.requirements");
  // Newest first: the follow-up tables come after this migration.
  await database.pool.query(await readFile("docs/schema/requirement-follow-ups-rollback.sql", "utf8"));
  await database.pool.query(await readFile("docs/schema/requirement-milestone-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='requirements' AND column_name='milestone'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirements")).toBe(requirements);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 2);
});
