import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// The audit record of requirement changes and the project audit trail (ADR-065, US-21), called
// directly against a disposable PostgreSQL database.
const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('reviewer','Reviewer','reviewer@example.invalid',true,now(),now()),
    ('observer','Observer','observer@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  api = await startApi(5135, {
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
    patch: (path: string, data?: object) => request.patch(url(path), { headers, data }),
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

async function setUp(request: APIRequestContext, name: string) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query(`INSERT INTO public.team_members (team_id,user_id,role) VALUES
    ($1,'member','member'),($1,'reviewer','reviewer'),($1,'observer','observer')`, [team.id]);
  const project = await (await owner.post("/projects", { name: "Checkout", teamId: team.id })).json();
  return { projectId: project.id as string };
}

type Event = { id: string; requirementId: string; action: string; version: number | null; changes: string[] | null; milestone: string | null; actor: string; occurredAt: string };

test("every change to a requirement is recorded with who made it, when, and what changed, newest first", async ({ request }) => {
  const { projectId } = await setUp(request, "Audit team");
  const member = await as(request, "member");
  const owner = await as(request, "owner");
  const created = await (await member.post(`/projects/${projectId}/requirements`,
    { title: "Guest checkout", description: "Pay", acceptanceCriteria: ["Done"], milestone: "Sprint 1" })).json();
  const path = `/requirements/${created.id}`;
  const save = async (who: typeof member, version: number, changes: object) =>
    (await who.put(path, { title: "Guest checkout", description: "Pay", acceptanceCriteria: ["Done"], documentIds: [], version, ...changes })).json();

  await save(owner, 1, { title: "Guest checkout v2" });
  await save(member, 2, { title: "Guest checkout v2", description: "Pay by card", acceptanceCriteria: ["Done", "Receipt"] });
  // A save that changes nothing is still a new version, recorded with no changes named.
  await save(member, 3, { title: "Guest checkout v2", description: "Pay by card", acceptanceCriteria: ["Done", "Receipt"] });
  expect((await member.post(`${path}/archive`)).status()).toBe(200);
  // Archiving again and restoring an active requirement change nothing and record nothing.
  expect((await member.post(`${path}/archive`)).status()).toBe(200);
  expect((await owner.post(`${path}/restore`)).status()).toBe(200);
  expect((await owner.post(`${path}/restore`)).status()).toBe(200);
  expect((await member.put(`${path}/milestone`, { milestone: "Sprint 2" })).status()).toBe(200);
  expect((await member.put(`${path}/milestone`, { milestone: "Sprint 2" })).status()).toBe(200);
  expect((await owner.put(`${path}/milestone`, { milestone: null })).status()).toBe(200);

  const response = await member.get(`${path}/events`);
  expect(response.status()).toBe(200);
  const events: Event[] = await response.json();
  expect(events.map(({ action, version, changes, milestone, actor }) => ({ action, version, changes, milestone, actor }))).toEqual([
    { action: "milestone_cleared", version: 4, changes: null, milestone: null, actor: "owner" },
    { action: "milestone_set", version: 4, changes: null, milestone: "Sprint 2", actor: "member" },
    { action: "restored", version: 4, changes: null, milestone: null, actor: "owner" },
    { action: "archived", version: 4, changes: null, milestone: null, actor: "member" },
    { action: "edited", version: 4, changes: [], milestone: null, actor: "member" },
    { action: "edited", version: 3, changes: ["description", "criteria"], milestone: null, actor: "member" },
    { action: "edited", version: 2, changes: ["title"], milestone: null, actor: "owner" },
    { action: "created", version: 1, changes: null, milestone: null, actor: "member" },
  ]);
  // Times are UTC, and each matches the requirement's own record where one exists.
  for (const event of events) expect(event.occurredAt).toMatch(/Z$/);
  const requirement = await (await member.get(path)).json();
  expect(events.at(-1)!.occurredAt).toBe(requirement.createdAt);
  expect(events.find(event => event.version === 4 && event.action === "edited")!.occurredAt).toBe(requirement.updatedAt);
  for (let index = 1; index < events.length; index++) {
    expect(Date.parse(events[index - 1].occurredAt)).toBeGreaterThanOrEqual(Date.parse(events[index].occurredAt));
  }

  // Every member reads the record; nobody outside the team does.
  for (const reader of ["owner", "reviewer", "observer"]) {
    expect(await (await (await as(request, reader)).get(`${path}/events`)).json(), reader).toEqual(events);
  }
  expect((await (await as(request, "outsider")).get(`${path}/events`)).status()).toBe(404);
  expect((await member.get(`/requirements/${crypto.randomUUID()}/events`)).status()).toBe(404);

  // A refused change records nothing.
  expect((await (await as(request, "observer")).post(`${path}/archive`)).status()).toBe(403);
  expect((await member.put(path, { title: "Stale", acceptanceCriteria: ["Done"], documentIds: [], version: 1 })).status()).toBe(409);
  expect(await (await member.get(`${path}/events`)).json()).toHaveLength(events.length);
});

test("nobody can change or remove an audit record through the API or the public database roles", async ({ request }) => {
  const { projectId } = await setUp(request, "Locked team");
  const owner = await as(request, "owner");
  const created = await (await owner.post(`/projects/${projectId}/requirements`, { title: "Locked", acceptanceCriteria: ["Done"] })).json();
  const [event] = await (await owner.get(`/requirements/${created.id}/events`)).json();
  for (const response of [
    await owner.post(`/requirements/${created.id}/events`, { action: "created" }),
    await owner.put(`/requirements/${created.id}/events`, {}),
    await owner.patch(`/requirements/${created.id}/events/${event.id}`, { actor: "member" }),
    await owner.delete(`/requirements/${created.id}/events/${event.id}`),
    await owner.delete(`/projects/${projectId}/audit`),
  ]) {
    expect([404, 405]).toContain(response.status());
  }
  expect(await (await owner.get(`/requirements/${created.id}/events`)).json()).toEqual([event]);

  const { rows: [security] } = await database.pool.query(`SELECT relrowsecurity AS rls FROM pg_class WHERE relname = 'requirement_events'`);
  expect(security.rls).toBe(true);
  const { rows: grants } = await database.pool.query(`SELECT grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_name = 'requirement_events' AND grantee IN ('anon','authenticated','PUBLIC')`);
  expect(grants).toEqual([]);
  // The table only accepts records that describe a real change.
  const bad = (columns: string) => database.pool.query(
    `INSERT INTO public.requirement_events (requirement_id, actor, ${columns.split("=")[0]}) VALUES ($1, 'owner', ${columns.split("=")[1]})`, [created.id]);
  for (const columns of ["action='renamed'", "action, version='edited', 0", "action, changes='created', ARRAY['title']",
    "action, changes='edited', ARRAY['owner']", "action, milestone='edited', 'Sprint 1'", "action='milestone_set'"]) {
    await expect(bad(columns), columns).rejects.toThrow(/check constraint/);
  }
  await expect(database.pool.query("DELETE FROM public.requirements WHERE id = $1", [created.id])).rejects.toThrow(/foreign key/);
});

test("the project audit trail lists the newest changes across requirements, links, decisions, follow-ups, and comments", async ({ request }) => {
  const { projectId } = await setUp(request, "Trail team");
  const member = await as(request, "member");
  const reviewer = await as(request, "reviewer");
  const first = await (await member.post(`/projects/${projectId}/requirements`, { title: "First", acceptanceCriteria: ["Done"] })).json();
  const second = await (await member.post(`/projects/${projectId}/requirements`, { title: "Second", acceptanceCriteria: ["Done"] })).json();
  await database.pool.query(`INSERT INTO public.requirement_evidence_events (requirement_id,evidence_id,action,kind,label,title,actor,occurred_at)
    VALUES ($1,gen_random_uuid(),'added','issue','#4','Guests cannot pay','member',now())`, [first.id]);
  expect((await member.post(`/requirements/${second.id}/follow-ups`, { originalRequirementId: first.id })).status()).toBe(201);
  expect((await reviewer.post(`/requirements/${first.id}/reviews`, { decision: "accepted", note: "", version: 1 })).status()).toBe(201);
  expect((await reviewer.post(`/requirements/${first.id}/comments`, { body: "A private thought about the card form" })).status()).toBe(201);
  // Another project's changes never appear.
  const other = await setUp(request, "Other team");
  await member.post(`/projects/${other.projectId}/requirements`, { title: "Elsewhere", acceptanceCriteria: ["Done"] });

  const response = await (await as(request, "observer")).get(`/projects/${projectId}/audit`);
  expect(response.status()).toBe(200);
  const entries = await response.json();
  expect(entries.map((entry: { area: string; action: string; requirementTitle: string; actor: string }) =>
    [entry.area, entry.action, entry.requirementTitle, entry.actor])).toEqual([
    ["comment", "created", "First", "reviewer"],
    ["decision", "accepted", "First", "reviewer"],
    ["follow_up", "added", "Second", "member"],
    ["evidence", "added", "First", "member"],
    ["requirement", "created", "Second", "member"],
    ["requirement", "created", "First", "member"],
  ]);
  expect(entries[2]).toMatchObject({ otherRequirementTitle: "First" });
  expect(entries[3]).toMatchObject({ label: "#4", title: "Guests cannot pay" });
  expect(entries[1]).toMatchObject({ version: 1 });
  expect(JSON.stringify(entries)).not.toContain("private thought");
  expect((await (await as(request, "outsider")).get(`/projects/${projectId}/audit`)).status()).toBe(404);

  // At most the newest 200 entries.
  await database.pool.query(`INSERT INTO public.requirement_events (requirement_id,action,version,actor,occurred_at)
    SELECT $1,'edited',1,'member',now() + make_interval(secs => n) FROM generate_series(1,250) n`, [second.id]);
  const capped = await (await member.get(`/projects/${projectId}/audit`)).json();
  expect(capped).toHaveLength(200);
  expect(capped.every((entry: { area: string; requirementTitle: string }) => entry.area === "requirement" && entry.requirementTitle === "Second")).toBe(true);
});

test("the migration records who created each existing requirement and who saved its current version, and rolls back cleanly", async () => {
  const count = async (sql: string, values: unknown[] = []) => (await database.pool.query(sql, values)).rows[0].count as number;
  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  await database.pool.query(await readFile("docs/schema/requirement-events-rollback.sql", "utf8"));
  expect(await count(`SELECT count(*)::int AS count FROM pg_tables WHERE tablename = 'requirement_events'`)).toBe(0);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);

  const { rows: [project] } = await database.pool.query(`SELECT id FROM public.projects LIMIT 1`);
  const insert = (title: string, version: number, updatedBy: string | null) => database.pool.query(
    `INSERT INTO public.requirements (id,project_id,title,description,created_by,created_at,updated_at,updated_by,version)
     VALUES (gen_random_uuid(),$1,$2,'','member','2026-01-01T00:00:00Z','2026-02-01T00:00:00Z',$3,$4) RETURNING id`, [project.id, title, updatedBy, version]);
  const { rows: [untouched] } = await insert("Untouched", 1, "member");
  const { rows: [edited] } = await insert("Edited", 3, "owner");
  const { rows: [legacy] } = await insert("Legacy", 2, null);

  await database.pool.query(await readFile("docs/schema/requirement-events.sql", "utf8"));
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history);
  const events = async (id: string) => (await database.pool.query(
    `SELECT action, version, changes, actor, occurred_at FROM public.requirement_events WHERE requirement_id = $1 ORDER BY occurred_at`, [id])).rows;
  expect(await events(untouched.id)).toEqual([
    { action: "created", version: 1, changes: null, actor: "member", occurred_at: new Date("2026-01-01T00:00:00Z") },
  ]);
  expect(await events(edited.id)).toEqual([
    { action: "created", version: 1, changes: null, actor: "member", occurred_at: new Date("2026-01-01T00:00:00Z") },
    { action: "edited", version: 3, changes: null, actor: "owner", occurred_at: new Date("2026-02-01T00:00:00Z") },
  ]);
  // A requirement saved before its editor was recorded reads as edited by its creator (ADR-050).
  expect((await events(legacy.id))[1]).toMatchObject({ action: "edited", version: 2, actor: "member" });
});
