import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// Milestone labels, the milestone filter (ADR-053), and the team's Evidence complete rule (ADR-057),
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

test("a requirement is Evidence complete only with an issue, a merged pull request whose checks passed, and a release that includes it", async ({ request }) => {
  const projectId = await createProject(request);
  const check = (result: string) => ({ name: `ci-${result}`, result, url: null, completedAt: null, kind: "check" });
  type Link = { kind: "issue" | "pull_request" | "commit" | "release"; state?: string; checks?: unknown; contains?: number[] };
  // Inserts the links in order; a release's `contains` names the earlier links it includes by position.
  const link = async (requirementId: string, links: Link[]) => {
    const ids: string[] = [];
    for (const { kind, state, checks = null, contains } of links) {
      const number = nextNumber++;
      const identity = kind === "commit" ? { sha: number.toString(16).padStart(40, "0") }
        : kind === "release" ? { tag: `v${number}` } : { number, state: state ?? "open" };
      const row = { requirement_id: requirementId, kind, repository_id: 1, repository_owner: "acme", repository_name: "box", title: "t",
        url: "https://github.com/acme/box", github_created_at: new Date(), github_updated_at: new Date(), linked_by: "owner",
        checks: checks === null ? null : JSON.stringify(checks),
        contains: contains === undefined ? null : JSON.stringify(Object.fromEntries(ids.map((id, index) => [id, contains.includes(index)]))),
        ...identity };
      const names = Object.keys(row);
      const { rows: [inserted] } = await database.pool.query(
        `INSERT INTO public.requirement_evidence (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
        Object.values(row));
      ids.push(inserted.id);
    }
  };
  const passed = [check("passed")];
  const issue: Link = { kind: "issue" };
  const merged = (checks: unknown = passed): Link => ({ kind: "pull_request", state: "merged", checks });
  const released = (...positions: number[]): Link => ({ kind: "release", contains: positions });
  const cases: [string, Link[], string[]][] = [
    ["no evidence", [], ["issue", "merged_pull_request", "passing_checks", "release"]],
    ["only an issue", [issue], ["merged_pull_request", "passing_checks", "release"]],
    ["complete", [issue, merged(), released(1)], []],
    ["a closed issue counts", [{ kind: "issue", state: "closed" }, merged(), released(1)], []],
    ["no issue", [merged(), released(0)], ["issue"]],
    ["an open pull request does not count", [issue, { kind: "pull_request", checks: passed }, released(1)],
      ["merged_pull_request", "passing_checks", "release"]],
    ["a commit does not count", [issue, { kind: "commit", checks: passed }, released(1)],
      ["merged_pull_request", "passing_checks", "release"]],
    ["unreadable checks", [issue, merged(null), released(1)], ["passing_checks"]],
    ["no checks", [issue, merged([]), released(1)], ["passing_checks"]],
    ["only skipped", [issue, merged([check("skipped")]), released(1)], ["passing_checks"]],
    ["passed, skipped, and neutral", [issue, merged([check("passed"), check("skipped"), check("neutral")]), released(1)], []],
    ["one failed", [issue, merged([check("passed"), check("failed")]), released(1)], ["passing_checks"]],
    ["one running", [issue, merged([check("passed"), check("running")]), released(1)], ["passing_checks"]],
    ["one cancelled", [issue, merged([check("passed"), check("cancelled")]), released(1)], ["passing_checks"]],
    ["no release", [issue, merged()], ["release"]],
    ["a release without the pull request", [issue, merged(), released()], ["release"]],
    ["a release not yet compared", [issue, merged(), { kind: "release" }], ["release"]],
    ["checks failed and no release", [issue, merged([check("failed")])], ["passing_checks", "release"]],
    ["two merged, one failed", [issue, merged(), merged([check("failed")]), released(1, 2)], ["passing_checks"]],
    ["two merged, one released", [issue, merged(), merged(), released(1)], ["release"]],
    ["two merged, each in its own release", [issue, merged(), merged(), released(1), released(2)], []],
    ["failing commits and open pull requests do not block",
      [issue, merged(), { kind: "commit", checks: [check("failed")] }, { kind: "pull_request", checks: null }, released(1)], []],
  ];
  const ids: Record<string, string> = {};
  for (const [title, links] of cases) {
    const requirement = await createRequirement(request, projectId, title, "Sprint 1");
    ids[title] = requirement.id;
    await link(requirement.id, links);
  }
  const status = (missing: string[]) => ({ evidenceComplete: missing.length === 0, evidenceMissing: missing });
  const member = await as(request, "member");
  const listed = await (await member.get(`/projects/${projectId}/requirements?milestone=Sprint%201`)).json();
  expect(Object.fromEntries(listed.map((r: { title: string; evidenceComplete: boolean; evidenceMissing: string[] }) =>
    [r.title, { evidenceComplete: r.evidenceComplete, evidenceMissing: r.evidenceMissing }])))
    .toEqual(Object.fromEntries(cases.map(([title, , missing]) => [title, status(missing)])));
  // The requirement itself carries the same status.
  for (const [title, , missing] of cases) {
    expect(await (await member.get(`/requirements/${ids[title]}`)).json(), title).toMatchObject(status(missing));
  }

  // So does every other response that returns one requirement: create, edit, archive, and restore.
  const created = await member.post(`/projects/${projectId}/requirements`, { title: "New", acceptanceCriteria: ["Done"] });
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject(status(["issue", "merged_pull_request", "passing_checks", "release"]));
  const complete = await (await member.get(`/requirements/${ids.complete}`)).json();
  const edited = await member.put(`/requirements/${ids.complete}`, { title: "complete", description: "Edited",
    acceptanceCriteria: complete.acceptanceCriteria.map((c: { text: string }) => c.text), documentIds: [], version: complete.version });
  expect(edited.status()).toBe(200);
  expect(await edited.json()).toMatchObject({ description: "Edited", ...status([]) });
  const archived = await member.post(`/requirements/${ids["no issue"]}/archive`);
  expect(archived.status()).toBe(200);
  expect(await archived.json()).toMatchObject({ archivedAt: expect.any(String), ...status(["issue"]) });
  const restored = await member.post(`/requirements/${ids["no issue"]}/restore`);
  expect(restored.status()).toBe(200);
  expect(await restored.json()).toMatchObject({ archivedAt: null, ...status(["issue"]) });
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
