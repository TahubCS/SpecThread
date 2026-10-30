import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";
import { stillWaiting, withTeamLock } from "../support/team-lock";

// Follow-up links between requirements (ADR-052), against a disposable PostgreSQL database, with
// tokens from the test JWKS issuer that Playwright starts for every run.
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
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  api = await startApi(5122, {
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
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

/** A project of the owner's team, where "member" is a member, with requirements of the given titles. */
async function setUp(request: APIRequestContext, titles: string[]) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name: "Box team" })).json();
  const project = await (await owner.post("/projects", { name: "Box", teamId: team.id })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query("INSERT INTO public.team_members (team_id,user_id) VALUES ($1,'member')", [team.id]);
  const ids: string[] = [];
  for (const title of titles) {
    ids.push((await (await owner.post(`/projects/${project.id}/requirements`, { title, acceptanceCriteria: ["Done"] })).json()).id);
  }
  return { projectId: project.id as string, ids };
}

test("a member marks a follow-up, both requirements show the link, and adding and removing are recorded", async ({ request }) => {
  const { ids: [original, followUp, other] } = await setUp(request, ["Box opens", "Box opens faster", "Box closes"]);
  const [owner, member] = [await as(request, "owner"), await as(request, "member")];
  const before = await (await owner.get(`/requirements/${followUp}`)).json();

  const added = await member.post(`/requirements/${followUp}/follow-ups`, { originalRequirementId: original });
  expect(added.status()).toBe(201);
  const link = await added.json();
  expect(link).toMatchObject({ requirementId: original, title: "Box opens", archivedAt: null, linkedBy: "member" });
  expect((await member.post(`/requirements/${followUp}/follow-ups`, { originalRequirementId: other })).status()).toBe(201);

  const ofFollowUp = await (await owner.get(`/requirements/${followUp}/follow-ups`)).json();
  expect(ofFollowUp.followUpOf.map((l: { title: string }) => l.title)).toEqual(["Box closes", "Box opens"]);
  expect(ofFollowUp.followedUpBy).toEqual([]);
  const ofOriginal = await (await owner.get(`/requirements/${original}/follow-ups`)).json();
  expect(ofOriginal.followUpOf).toEqual([]);
  expect(ofOriginal.followedUpBy).toEqual([{ requirementId: followUp, title: "Box opens faster", archivedAt: null, linkedBy: "member", linkedAt: link.linkedAt }]);
  expect(ofOriginal.history).toEqual([expect.objectContaining({
    requirementId: followUp, requirementTitle: "Box opens faster", originalRequirementId: original, originalTitle: "Box opens",
    action: "added", actor: "member", occurredAt: link.linkedAt,
  })]);

  // Linking is not an edit: neither requirement's version changes.
  expect(await (await owner.get(`/requirements/${followUp}`)).json()).toMatchObject({ version: before.version, updatedAt: before.updatedAt });

  expect((await owner.delete(`/requirements/${followUp}/follow-ups/${original}`)).status()).toBe(204);
  expect((await owner.delete(`/requirements/${followUp}/follow-ups/${original}`)).status()).toBe(404);
  const after = await (await member.get(`/requirements/${original}/follow-ups`)).json();
  expect(after.followedUpBy).toEqual([]);
  expect(after.history.map((e: { action: string; actor: string }) => [e.action, e.actor])).toEqual([["removed", "owner"], ["added", "member"]]);
  expect((await (await member.get(`/requirements/${followUp}/follow-ups`)).json()).history).toHaveLength(3);
});

test("links stay within one project, never point at themselves or back, and are limited", async ({ request }) => {
  const { ids: [first, second, ...rest] } = await setUp(request, ["One", "Two", ...Array.from({ length: 21 }, (_, i) => `Extra ${i}`)]);
  const { ids: [elsewhere] } = await setUp(request, ["Other project"]);
  const owner = await as(request, "owner");
  const add = (id: string, originalRequirementId: unknown) => owner.post(`/requirements/${id}/follow-ups`, { originalRequirementId });
  const error = async (response: Awaited<ReturnType<typeof add>>) => {
    expect(response.status()).toBe(400);
    return (await response.json()).errors.originalRequirementId[0];
  };

  expect(await error(await add(first, null))).toBe("Choose a requirement.");
  expect(await error(await add(first, first))).toBe("A requirement can't be a follow-up of itself.");
  expect(await error(await add(first, elsewhere))).toBe("Choose a requirement in this project.");
  expect(await error(await add(first, "00000000-0000-4000-8000-000000000000"))).toBe("Choose a requirement in this project.");
  expect((await add(first, second)).status()).toBe(201);
  const duplicate = await add(first, second);
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).detail).toBe("This requirement is already a follow-up of that one.");
  expect(await error(await add(second, first))).toBe("That requirement is already a follow-up of this one.");

  for (const id of rest.slice(0, 19)) expect((await add(first, id)).status()).toBe(201);
  expect(await error(await add(first, rest[19]))).toBe("A requirement can follow up at most 20 requirements.");
  expect((await database.pool.query("SELECT count(*)::int AS count FROM public.requirement_follow_ups WHERE requirement_id = $1", [first])).rows[0].count).toBe(20);
});

test("archived requirements and projects refuse changes, and outsiders see nothing", async ({ request }) => {
  const { projectId, ids: [original, followUp, archived] } = await setUp(request, ["Box opens", "Box opens faster", "Old box"]);
  const owner = await as(request, "owner");
  expect((await owner.post(`/requirements/${followUp}/follow-ups`, { originalRequirementId: original })).status()).toBe(201);
  expect((await owner.post(`/requirements/${archived}/archive`)).status()).toBe(200);

  const refused = await owner.post(`/requirements/${followUp}/follow-ups`, { originalRequirementId: archived });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).detail).toBe("An archived requirement can't be linked as an original.");
  expect((await owner.post(`/requirements/${archived}/follow-ups`, { originalRequirementId: original })).status()).toBe(409);

  // An archived original stays linked and is shown as archived.
  expect((await owner.post(`/requirements/${original}/archive`)).status()).toBe(200);
  const listed = await (await owner.get(`/requirements/${followUp}/follow-ups`)).json();
  expect(listed.followUpOf[0].archivedAt).not.toBeNull();
  expect((await owner.post(`/requirements/${original}/restore`)).status()).toBe(200);

  // A write waits for a concurrent team write, then sees the project it archived.
  const pending = await withTeamLock(database.pool, projectId, async client => {
    const response = owner.delete(`/requirements/${followUp}/follow-ups/${original}`);
    expect(await stillWaiting(response)).toBe(true);
    await client.query("UPDATE public.projects SET archived_at = now() WHERE id = $1", [projectId]);
    return { response };
  });
  expect((await pending.response).status()).toBe(409);
  expect((await owner.post(`/requirements/${followUp}/follow-ups`, { originalRequirementId: original })).status()).toBe(409);
  expect((await (await owner.get(`/requirements/${followUp}/follow-ups`)).json()).followUpOf).toHaveLength(1);

  const outsider = await as(request, "outsider");
  expect((await outsider.get(`/requirements/${followUp}/follow-ups`)).status()).toBe(404);
  expect((await outsider.post(`/requirements/${followUp}/follow-ups`, { originalRequirementId: original })).status()).toBe(404);
  expect((await outsider.delete(`/requirements/${followUp}/follow-ups/${original}`)).status()).toBe(404);
  expect((await request.get(`${api.baseURL}/requirements/${followUp}/follow-ups`)).status()).toBe(401);
});

test("the migration protects and constrains both tables, and its rollback removes only them", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  for (const table of ["requirement_follow_ups", "requirement_follow_up_events"]) {
    expect(await count(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='${table}' AND rowsecurity`)).toBe(1);
    expect(await count(`SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_name='${table}' AND grantee IN ('anon','authenticated','PUBLIC')`)).toBe(0);
  }
  const { rows: [a, b] } = await database.pool.query("SELECT id FROM public.requirements ORDER BY created_at LIMIT 2");
  await expect(database.pool.query("INSERT INTO public.requirement_follow_ups (requirement_id,original_requirement_id,linked_by) VALUES ($1,$1,'owner')", [a.id]))
    .rejects.toThrow(/check constraint/);
  await expect(database.pool.query("INSERT INTO public.requirement_follow_up_events (requirement_id,original_requirement_id,action,actor) VALUES ($1,$2,'renamed','owner')", [a.id, b.id]))
    .rejects.toThrow(/check constraint/);
  await expect(database.pool.query("INSERT INTO public.requirement_follow_up_events (requirement_id,original_requirement_id,action,actor) VALUES ($1,$2,'added','nobody')", [a.id, b.id]))
    .rejects.toThrow(/foreign key/);
  const { rows: [linked] } = await database.pool.query("SELECT requirement_id AS id FROM public.requirement_follow_ups LIMIT 1");
  await expect(database.pool.query("DELETE FROM public.requirements WHERE id = $1", [linked.id])).rejects.toThrow(/foreign key/);

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  const requirements = await count("SELECT count(*)::int AS count FROM public.requirements");
  await database.pool.query(await readFile("docs/schema/requirement-follow-ups-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'requirement_follow_up%'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirements")).toBe(requirements);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);
});
