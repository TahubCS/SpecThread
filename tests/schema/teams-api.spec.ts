import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  test.setTimeout(180_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('admin','Admin','admin@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  const connection = new URL(database.connectionString);
  api = await startApi(5107, { Auth__Issuer: issuer,
    ConnectionStrings__Database: `Host=${connection.hostname};Port=${connection.port};Database=postgres;Username=${connection.username};Password=${connection.password}` });
});
test.afterAll(async () => { api?.stop(); await database?.stop(); });

async function as(request: APIRequestContext, sub: string) {
  const response = await request.post(`${issuer}/sign`, { data: { claims: { sub } } });
  expect(response.status()).toBe(200);
  const headers = { authorization: `Bearer ${(await response.json()).token}` };
  return {
    get: (path: string) => request.get(`${api.baseURL}${path}`, { headers }),
    post: (data: object) => request.post(`${api.baseURL}/teams`, { headers, data }),
    postTo: (path: string, data: object) => request.post(`${api.baseURL}${path}`, { headers, data }),
    patch: (path: string, data: object) => request.patch(`${api.baseURL}${path}`, { headers, data }),
  };
}

test("creation persists a team and one owner membership, with stored timestamp precision", async ({ request }) => {
  const owner = await as(request, "owner");
  const created = await owner.post({ name: "  Checkout  ", description: "  Ship together  ", ownerUserId: "outsider", role: "admin" });
  expect(created.status()).toBe(201);
  const team = await created.json();
  expect(team).toMatchObject({ name: "Checkout", description: "Ship together", ownerUserId: "owner", role: "owner", memberCount: 1 });
  expect(created.headers().location).toBe(`/teams/${team.id}`);
  const loaded = await owner.get(`/teams/${team.id}`);
  expect(loaded.status()).toBe(200);
  expect(await loaded.json()).toEqual(team);
  expect((await database.pool.query("SELECT user_id,role FROM team_members WHERE team_id=$1", [team.id])).rows)
    .toEqual([{ user_id: "owner", role: "member" }]);
  expect((await (await owner.get("/teams")).json()).map((t: { id: string }) => t.id)).toContain(team.id);
});

test("only memberships are listed, and roles and counts come from current database rows", async ({ request }) => {
  const owner = await as(request, "owner");
  const { id } = await (await owner.post({ name: "A shared team" })).json();
  await database.pool.query("INSERT INTO team_members(team_id,user_id,role) VALUES ($1,'admin','admin'),($1,'member','member')", [id]);
  for (const role of ["owner", "admin", "member"]) {
    const caller = await as(request, role);
    const team = await (await caller.get(`/teams/${id}`)).json();
    expect(team).toMatchObject({ id, role, memberCount: 3 });
    expect((await (await caller.get("/teams")).json()).some((t: { id: string }) => t.id === id)).toBe(true);
  }
  const names = (await (await owner.get("/teams")).json()).map((t: { name: string }) => t.name);
  expect(names).toEqual(["A shared team", "Checkout"]);
  const outsider = await as(request, "outsider");
  expect(await (await outsider.get("/teams")).json()).toEqual([]);
  expect((await outsider.get(`/teams/${id}`)).status()).toBe(404);
  expect((await outsider.get("/teams/00000000-0000-0000-0000-000000000000")).status()).toBe(404);
  await database.pool.query("DELETE FROM team_members WHERE team_id=$1 AND user_id='member'", [id]);
  expect((await (await as(request, "member")).get(`/teams/${id}`)).status()).toBe(404);
});

test("invalid creation, anonymous callers, and nonexistent accounts cannot create teams", async ({ request }) => {
  const owner = await as(request, "owner");
  for (const data of [{}, { name: " " }, { name: "x".repeat(201) }, { name: "x", description: "x".repeat(10_001) }]) {
    const response = await owner.post(data);
    expect(response.status()).toBe(400);
    expect((await response.json()).errors).toBeDefined();
  }
  expect((await (await as(request, "no-account")).post({ name: "Missing account" })).status()).toBe(403);
  expect((await request.post(`${api.baseURL}/teams`, { data: { name: "Anonymous" } })).status()).toBe(401);
  expect((await request.get(`${api.baseURL}/teams`)).status()).toBe(401);
  expect((await database.pool.query("SELECT count(*)::int AS count FROM teams")).rows[0].count).toBe(2);
});

test("first-team onboarding cannot be bypassed and simultaneous submissions create one team", async ({ request }) => {
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt")
    VALUES ('new-account','New account','new@example.invalid',true,now(),now())`);
  const newcomer = await as(request, "new-account");
  expect(await (await newcomer.get("/onboarding")).json()).toEqual({ completed: false });
  const blocked = await newcomer.postTo("/projects", { name: "Bypass setup" });
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toMatchObject({ code: "onboarding_required" });
  expect((await newcomer.postTo("/onboarding", { name: " " })).status()).toBe(400);
  expect(await (await newcomer.get("/onboarding")).json()).toEqual({ completed: false });
  const results = await Promise.all([
    newcomer.postTo("/onboarding", { name: "First team" }),
    newcomer.postTo("/onboarding", { name: "First team" }),
  ]);
  expect(results.map(response => response.status()).sort()).toEqual([201, 409]);
  expect(await (await newcomer.get("/onboarding")).json()).toEqual({ completed: true });
  expect((await newcomer.postTo("/onboarding", { name: "Duplicate setup" })).status()).toBe(409);
  expect((await database.pool.query("SELECT count(*)::int AS count FROM teams WHERE owner_user_id='new-account'")).rows[0].count).toBe(1);
  await database.pool.query("DELETE FROM team_members WHERE user_id='new-account'");
  expect(await (await newcomer.get("/onboarding")).json()).toEqual({ completed: true });
  await database.pool.query(`DELETE FROM teams WHERE owner_user_id='new-account'; DELETE FROM public."user" WHERE id='new-account'`);
});

test("navigation preferences belong to each caller and member data is membership protected", async ({ request }) => {
  const owner = await as(request, "owner");
  const teams = await (await owner.get("/teams")).json();
  const shared = teams.find((team: { name: string }) => team.name === "A shared team");
  expect((await owner.patch(`/teams/${shared.id}/preferences`, { isFavorite: true, isExpanded: false, userId: "admin" })).status()).toBe(200);
  expect(await (await owner.get(`/teams/${shared.id}`)).json()).toMatchObject({ isFavorite: true, isExpanded: false });
  const admin = await as(request, "admin");
  expect(await (await admin.get(`/teams/${shared.id}`)).json()).toMatchObject({ isFavorite: false, isExpanded: true });
  const members = await (await admin.get(`/teams/${shared.id}/members`)).json();
  expect(members.map((member: { role: string }) => member.role)).toEqual(["owner", "admin"]);
  expect(members[0]).toMatchObject({ name: "Owner", email: "owner@example.invalid" });
  const outsider = await as(request, "outsider");
  expect((await outsider.patch(`/teams/${shared.id}/preferences`, { isFavorite: true })).status()).toBe(404);
  expect((await outsider.get(`/teams/${shared.id}/members`)).status()).toBe(404);
});

test("Teams migration locks down browser roles and rolls back without touching existing data", async () => {
  const { rows } = await database.pool.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('teams','team_members') ORDER BY tablename");
  expect(rows).toEqual([{ tablename: "team_members", rowsecurity: true }, { tablename: "teams", rowsecurity: true }]);
  for (const role of ["anon", "authenticated"]) {
    const { rows: grants } = await database.pool.query("SELECT has_table_privilege($1,'public.teams','SELECT') AS teams, has_table_privilege($1,'public.team_members','SELECT') AS members", [role]);
    expect(grants[0]).toEqual({ teams: false, members: false });
  }
  // RLS still denies rows if a future change accidentally grants SELECT.
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN; GRANT SELECT ON teams TO authenticated; SET LOCAL ROLE authenticated;");
    expect((await client.query("SELECT count(*)::int AS count FROM teams")).rows[0].count).toBe(0);
  } finally { await client.query("ROLLBACK"); client.release(); }
  await database.pool.query(`INSERT INTO projects (name,owner_user_id) VALUES ('Preserved project','owner')`);
  const security = await database.pool.query("SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='user_onboarding'");
  expect(security.rows[0]).toEqual({ rowsecurity: true });
  for (const role of ["anon", "authenticated"]) {
    expect((await database.pool.query("SELECT has_table_privilege($1,'public.user_onboarding','SELECT') AS allowed", [role])).rows[0].allowed).toBe(false);
  }
  await database.pool.query(await readFile("docs/schema/team-navigation-rollback.sql", "utf8"));
  expect((await database.pool.query("SELECT name FROM teams ORDER BY name")).rows).toEqual([{ name: "A shared team" }, { name: "Checkout" }]);
  await database.pool.query(await readFile("docs/schema/team-navigation.sql", "utf8"));
  expect((await database.pool.query("SELECT user_id FROM user_onboarding ORDER BY user_id")).rows).toEqual([{ user_id: "admin" }, { user_id: "owner" }]);
  await database.pool.query(await readFile("docs/schema/team-navigation-rollback.sql", "utf8"));
  await database.pool.query(await readFile("docs/schema/teams-rollback.sql", "utf8"));
  expect((await database.pool.query("SELECT to_regclass('public.teams') AS teams, to_regclass('public.team_members') AS members")).rows[0])
    .toEqual({ teams: null, members: null });
  expect((await database.pool.query("SELECT name FROM projects")).rows).toEqual([{ name: "Preserved project" }]);
  expect((await database.pool.query('SELECT count(*)::int AS count FROM public."user"')).rows[0].count).toBe(4);
  await database.pool.query(await readFile("docs/schema/teams.sql", "utf8"));
  await database.pool.query(await readFile("docs/schema/team-navigation.sql", "utf8"));
});
