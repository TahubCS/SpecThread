import { expect, test, type APIRequestContext } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startFakeGitHub } from "../../scripts/test-github.mjs";
import { startApi } from "../support/api-process";

// Finding issues and pull requests by title, and the history of evidence links added and
// removed (ADR-054), against a disposable PostgreSQL database and a local stand-in for GitHub.
const issuer = "http://127.0.0.1:5101";
const gitHub = "http://127.0.0.1:5124";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let fake: Server;
let nextId = 3000;

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
  fake = await startFakeGitHub({ port: 5124, appId: "999", publicKey: key.publicKey });
  api = await startApi(5125, {
    ConnectionStrings__Database: `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`,
    Auth__Issuer: issuer, GitHub__ApiBaseUrl: gitHub, GitHub__AppId: "999",
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
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

type Item = { number: number; pull?: boolean; merged?: boolean; title: string; state: string; user?: string | null; created_at: string; updated_at: string; closed_at?: string };
const item = (number: number, title: string, extra: Partial<Item> = {}): Item =>
  ({ number, title, state: "open", user: "ada", created_at: "2026-09-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", ...extra });

/** A project with a member, one requirement, and, unless told otherwise, a connected repository GitHub knows with these items. */
async function setUp(request: APIRequestContext, items: Item[], connected = true) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name: "Product team" })).json();
  const project = await (await owner.post("/projects", { name: "Checkout", teamId: team.id })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query("INSERT INTO public.team_members (team_id,user_id) VALUES ($1,'member')", [team.id]);
  const requirement = await (await owner.post(`/projects/${project.id}/requirements`, { title: "Guest checkout", acceptanceCriteria: ["Done"] })).json();
  const [installationId, repositoryId] = [nextId++, nextId++];
  // Each project gets its own repository name, as on GitHub, where search finds a repository by name.
  const name = `web-${repositoryId}`;
  await request.put(`${gitHub}/__github/users/seed-${installationId}`, { data: { installations: [{ id: installationId, repositories: [{ id: repositoryId, owner: "acme", name }] }] } });
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/items`, { data: { items } });
  if (connected) {
    await database.pool.query(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
      VALUES ($1,$2,$3,'acme',$4,false,'owner')`, [project.id, installationId, repositoryId, name]);
  }
  return { projectId: project.id as string, path: `/requirements/${requirement.id}/evidence`, name };
}

type Event = { action: string; label: string; title: string; kind: string; actor: string; evidenceId: string; occurredAt: string };

test("adding and removing a link is recorded with who and when, newest first, and outlives the link", async ({ request }) => {
  const { path } = await setUp(request, [item(20, "Guests cannot pay"), item(5, "Add guest checkout", { pull: true })]);
  const [owner, member] = [await as(request, "owner"), await as(request, "member")];
  expect(await (await member.get(`${path}/history`)).json()).toEqual([]);

  const issue = await (await member.post(path, { reference: "#20" })).json();
  const pull = await (await owner.post(path, { reference: "5" })).json();
  expect((await owner.delete(`${path}/${issue.id}`)).status()).toBe(204);
  expect((await owner.delete(`${path}/${issue.id}`)).status()).toBe(404);

  const history: Event[] = await (await member.get(`${path}/history`)).json();
  expect(history.map(e => [e.action, e.label, e.title, e.kind, e.actor])).toEqual([
    ["removed", "#20", "Guests cannot pay", "issue", "owner"],
    ["added", "#5", "Add guest checkout", "pull_request", "owner"],
    ["added", "#20", "Guests cannot pay", "issue", "member"],
  ]);
  expect(history[2]).toMatchObject({ evidenceId: issue.id, occurredAt: issue.linkedAt });
  expect(history[1]).toMatchObject({ evidenceId: pull.id, occurredAt: pull.linkedAt });
  expect(Date.parse(history[0].occurredAt)).toBeGreaterThanOrEqual(Date.parse(history[1].occurredAt));

  // A refused removal records nothing.
  const outsider = await as(request, "outsider");
  expect((await outsider.delete(`${path}/${pull.id}`)).status()).toBe(404);
  expect((await outsider.get(`${path}/history`)).status()).toBe(404);
  expect((await request.get(`${api.baseURL}${path}/history`)).status()).toBe(401);
  expect(await (await member.get(`${path}/history`)).json()).toHaveLength(3);
});

test("issues and pull requests are found by words in their titles, with state, author, and whether they are linked", async ({ request }) => {
  const { path, name } = await setUp(request, [
    item(20, "Guests cannot pay"),
    item(5, "Add guest checkout", { pull: true, user: "grace" }),
    item(2, "Guest spike", { pull: true, merged: true, state: "closed", closed_at: "2026-09-04T10:00:00Z", user: null }),
    item(7, "Cart totals are wrong", { state: "closed" }),
  ]);
  const member = await as(request, "member");
  const search = async (q: string) => {
    const response = await member.get(`${path}/search?${new URLSearchParams({ q })}`);
    expect(response.status(), q).toBe(200);
    return (await response.json()).items;
  };
  expect((await member.post(path, { reference: "20" })).status()).toBe(201);

  expect(await search("guest")).toEqual([
    { number: 20, kind: "issue", title: "Guests cannot pay", state: "open", author: "ada", url: `https://github.com/acme/${name}/issues/20`, linked: true },
    { number: 5, kind: "pull_request", title: "Add guest checkout", state: "open", author: "grace", url: `https://github.com/acme/${name}/pull/5`, linked: false },
    { number: 2, kind: "pull_request", title: "Guest spike", state: "merged", author: null, url: `https://github.com/acme/${name}/pull/2`, linked: false },
  ]);
  expect((await search("  guest   PAY ")).map((r: { number: number }) => r.number)).toEqual([20]);
  expect((await search("cart")).map((r: { state: string }) => r.state)).toEqual(["closed"]);
  expect(await search("refund")).toEqual([]);
  // Words are searched for, never read as qualifiers that could reach another repository.
  expect(await search('guest repo:acme/other')).toEqual([]);
  expect(await search('"guest" "pay"')).toHaveLength(1);
  // Searching links nothing.
  expect(await (await member.get(path)).json()).toHaveLength(1);
});

test("searches are validated, need a connected repository, stay in it, and report GitHub failures", async ({ request }) => {
  const { path, name } = await setUp(request, [item(1, "Guests cannot pay")]);
  const member = await as(request, "member");
  for (const query of ["", "q=", "q=%20%20", `q=${'"'.repeat(3)}`, `q=${"x".repeat(201)}`]) {
    const response = await member.get(`${path}/search?${query}`);
    expect(response.status(), query).toBe(400);
    expect((await response.json()).errors.q, query).toHaveLength(1);
  }

  const fault = (data: object) => request.post(`${gitHub}/__github/faults`, { data: { bearer: "installation", path: "^/search/issues$", ...data } });
  const clear = () => request.delete(`${gitHub}/__github/faults?bearer=installation`);
  // Whatever GitHub answers, items of another repository are not shown.
  await fault({ status: 200, times: 1, body: { items: [
    { number: 9, title: "Guest", state: "open", user: null, html_url: "https://github.com/acme/secret/issues/9", repository_url: "https://api.github.com/repos/acme/secret" },
    { number: 1, title: "Guests cannot pay", state: "open", user: null, html_url: `https://github.com/acme/${name}/issues/1`, repository_url: `https://api.github.com/repos/acme/${name}` },
  ] } });
  expect((await (await member.get(`${path}/search?q=guest`)).json()).items.map((r: { number: number }) => r.number)).toEqual([1]);
  for (const [data, status] of [[{ status: 500 }, 502], [{ status: 403, headers: { "x-ratelimit-remaining": "0" } }, 502], [{ status: 200, body: { items: "nope" } }, 502]] as const) {
    await fault(data);
    expect((await member.get(`${path}/search?q=guest`)).status(), JSON.stringify(data)).toBe(status);
    await clear();
  }

  const unconnected = await setUp(request, [], false);
  const refused = await member.get(`${unconnected.path}/search?q=guest`);
  expect(refused.status()).toBe(409);
  expect((await refused.json()).detail).toBe("Connect a GitHub repository to this project first.");
  expect((await (await as(request, "outsider")).get(`${path}/search?q=guest`)).status()).toBe(404);
  expect((await request.get(`${api.baseURL}${path}/search?q=guest`)).status()).toBe(401);
});

test("the migration protects the history, starts it with every existing link, and its rollback removes only the history", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_evidence_events' AND rowsecurity")).toBe(1);
  expect(await count("SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_name='requirement_evidence_events' AND grantee IN ('anon','authenticated','PUBLIC')")).toBe(0);
  const { rows: [requirement] } = await database.pool.query("SELECT id FROM public.requirements LIMIT 1");
  const insert = (values: Record<string, unknown>) => {
    const row = { requirement_id: requirement.id, evidence_id: "00000000-0000-4000-8000-000000000001", action: "added", kind: "issue", label: "#1", title: "t", actor: "owner", ...values };
    const names = Object.keys(row);
    return database.pool.query(`INSERT INTO public.requirement_evidence_events (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
  };
  await insert({});
  for (const values of [{ action: "renamed" }, { kind: "deployment" }, { label: "  " }, { title: null }, { actor: null }]) {
    await expect(insert(values), JSON.stringify(values)).rejects.toThrow(/check constraint|not-null/);
  }
  await expect(insert({ actor: "nobody" })).rejects.toThrow(/foreign key/);

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  const links = await count("SELECT count(*)::int AS count FROM public.requirement_evidence");
  await database.pool.query(await readFile("docs/schema/requirement-evidence-events-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_evidence_events'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence")).toBe(links);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);

  // Applied to existing links, each starts its history as added by whoever linked it, when they did.
  await database.pool.query(await readFile("docs/schema/requirement-evidence-events.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence_events")).toBe(links);
  expect(await count(`SELECT count(*)::int AS count FROM public.requirement_evidence e JOIN public.requirement_evidence_events v
    ON v.evidence_id = e.id AND v.action = 'added' AND v.kind = e.kind AND v.title = e.title AND v.actor = e.linked_by AND v.occurred_at = e.linked_at
    AND v.label = '#' || e.number`)).toBe(links);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history);
});
