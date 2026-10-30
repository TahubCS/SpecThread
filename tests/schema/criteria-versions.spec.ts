import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// Acceptance-criteria versions and the confirmation to change accepted criteria (ADR-051), against a
// disposable PostgreSQL database, with tokens from the test JWKS issuer that Playwright starts.
const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('author','Author','author@example.invalid',true,now(),now()),
    ('reviewer','Reviewer','reviewer@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  api = await startApi(5121, {
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

/** A project of the author's team, where the reviewer is a member, with one requirement the author wrote. */
async function setUp(request: APIRequestContext, criteria = ["The lid lifts", "The box closes"]) {
  const author = await as(request, "author");
  const team = await (await author.post("/teams", { name: "Box team" })).json();
  const project = await (await author.post("/projects", { name: "Box", teamId: team.id })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query("INSERT INTO public.team_members (team_id,user_id) VALUES ($1,'reviewer')", [team.id]);
  const created = await author.post(`/projects/${project.id}/requirements`, { title: "Box opens", acceptanceCriteria: criteria });
  expect(created.status()).toBe(201);
  const requirement = await created.json();
  return { projectId: project.id as string, requirementId: requirement.id as string, requirement };
}

type Version = { number: number; criteria: string[]; createdBy: string; createdAt: string };

test("creating writes version 1, and only a change to the ordered criteria adds a version", async ({ request }) => {
  const { requirementId, requirement } = await setUp(request);
  const [author, reviewer] = [await as(request, "author"), await as(request, "reviewer")];
  const path = `/requirements/${requirementId}`;
  const versions = async (): Promise<Version[]> => (await (await reviewer.get(`${path}/criteria-versions`)).json());
  expect(requirement.criteriaVersion).toBe(1);
  expect(await versions()).toEqual([{ number: 1, criteria: ["The lid lifts", "The box closes"], createdBy: "author", createdAt: requirement.createdAt }]);

  const save = async (by: typeof author, version: number, acceptanceCriteria: string[], title = "Box opens") => {
    const response = await by.put(path, { title, acceptanceCriteria, version });
    expect(response.status()).toBe(200);
    return response.json();
  };
  // A title change is a new requirement version but not a new criteria version.
  expect(await save(reviewer, 1, ["The lid lifts", "The box closes"], "Box opens easily")).toMatchObject({ version: 2, criteriaVersion: 1 });
  expect(await versions()).toHaveLength(1);

  const changed = await save(reviewer, 2, ["The lid lifts", "The box locks"]);
  expect(changed).toMatchObject({ version: 3, criteriaVersion: 2 });
  expect((await versions())[0]).toEqual({ number: 2, criteria: ["The lid lifts", "The box locks"], createdBy: "reviewer", createdAt: changed.updatedAt });
  // The order is part of the criteria; surrounding spaces are not.
  expect(await save(author, 3, ["The box locks", "The lid lifts"])).toMatchObject({ criteriaVersion: 3 });
  expect(await save(author, 4, ["  The box locks ", "The lid lifts"])).toMatchObject({ version: 5, criteriaVersion: 3 });
  expect((await versions()).map(version => version.number)).toEqual([3, 2, 1]);

  const first = await reviewer.get(`${path}/criteria-versions/1`);
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({ number: 1, criteria: ["The lid lifts", "The box closes"], createdBy: "author" });
  expect((await reviewer.get(`${path}/criteria-versions/4`)).status()).toBe(404);
  expect((await (await reviewer.get(path)).json()).criteriaVersion).toBe(3);

  // Archived requirements keep their versions readable.
  expect((await author.post(`${path}/archive`)).status()).toBe(200);
  expect(await versions()).toHaveLength(3);

  const outsider = await as(request, "outsider");
  expect((await outsider.get(`${path}/criteria-versions`)).status()).toBe(404);
  expect((await outsider.get(`${path}/criteria-versions/1`)).status()).toBe(404);
  expect((await request.get(`${api.baseURL}${path}/criteria-versions`)).status()).toBe(401);
});

test("changing accepted criteria needs confirmation, and the acceptance stays with the criteria it was made on", async ({ request }) => {
  const { projectId, requirementId } = await setUp(request);
  const [author, reviewer] = [await as(request, "author"), await as(request, "reviewer")];
  const path = `/requirements/${requirementId}`;
  const summary = async () =>
    (await (await author.get(`/projects/${projectId}/requirements`)).json()).find((r: { id: string }) => r.id === requirementId);
  const criteriaRows = async () =>
    (await database.pool.query("SELECT text FROM public.acceptance_criteria WHERE requirement_id = $1 ORDER BY position", [requirementId])).rows.map(r => r.text);

  const accepted = await reviewer.post(`${path}/reviews`, { decision: "accepted", version: 1 });
  expect(accepted.status()).toBe(201);
  expect(await accepted.json()).toMatchObject({ decision: "accepted", criteriaVersion: 1 });
  expect((await summary()).review).toMatchObject({ decision: "accepted", outdated: false, criteriaChanged: false, criteriaVersion: 1 });

  // Other edits need no confirmation; they make the decision outdated as before.
  expect((await author.put(path, { title: "Box opens fast", acceptanceCriteria: ["The lid lifts", "The box closes"], version: 1 })).status()).toBe(200);
  expect((await summary()).review).toMatchObject({ outdated: true, criteriaChanged: false });

  const changed = { title: "Box opens fast", acceptanceCriteria: ["The lid lifts in one second"], version: 2 };
  for (const confirmCriteriaChange of [undefined, false]) {
    const refused = await author.put(path, { ...changed, confirmCriteriaChange });
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "accepted_criteria_change", acceptedCriteriaVersion: 1 });
  }
  // A refused save changes nothing.
  expect(await (await author.get(path)).json()).toMatchObject({ version: 2, criteriaVersion: 1 });
  expect(await criteriaRows()).toEqual(["The lid lifts", "The box closes"]);
  expect(await (await author.get(`${path}/criteria-versions`)).json()).toHaveLength(1);

  const confirmed = await author.put(path, { ...changed, confirmCriteriaChange: true });
  expect(confirmed.status()).toBe(200);
  expect(await confirmed.json()).toMatchObject({ version: 3, criteriaVersion: 2 });
  expect((await summary()).review).toMatchObject({ decision: "accepted", outdated: true, criteriaChanged: true, criteriaVersion: 1 });
  const reviews = await (await author.get(`${path}/reviews`)).json();
  expect(reviews).toHaveLength(1);
  expect(reviews[0]).toMatchObject({ decision: "accepted", criteriaVersion: 1, requirementVersion: 1 });

  // The acceptance no longer applies to the current criteria, so later changes need no confirmation.
  expect((await author.put(path, { ...changed, acceptanceCriteria: ["The lid lifts", "It is quiet"], version: 3 })).status()).toBe(200);
  // A new acceptance applies to the current criteria again; a later rejection lifts the confirmation.
  expect((await reviewer.post(`${path}/reviews`, { decision: "accepted", version: 4 })).status()).toBe(201);
  expect((await summary()).review).toMatchObject({ outdated: false, criteriaChanged: false, criteriaVersion: 3 });
  expect((await author.put(path, { ...changed, version: 4 })).status()).toBe(409);
  expect((await reviewer.post(`${path}/reviews`, { decision: "rejected", note: "Too loud", version: 4 })).status()).toBe(201);
  expect((await author.put(path, { ...changed, version: 4 })).status()).toBe(200);
});

test("criteria saved without a version, as by the previous API during a deploy, get a catch-up version first", async ({ request }) => {
  const { requirementId } = await setUp(request);
  const [author, reviewer] = [await as(request, "author"), await as(request, "reviewer")];
  const path = `/requirements/${requirementId}`;
  // What the previous API does on save: replace the criteria rows and bump the version, nothing else.
  await database.pool.query(`DELETE FROM public.acceptance_criteria WHERE requirement_id = $1;`, [requirementId]);
  await database.pool.query(`INSERT INTO public.acceptance_criteria (requirement_id,text,position) VALUES ($1,'Changed by the old API',0)`, [requirementId]);
  await database.pool.query(`UPDATE public.requirements SET version = 2, updated_by = 'reviewer', updated_at = '2026-10-20T10:00:00Z' WHERE id = $1`, [requirementId]);

  const decided = await reviewer.post(`${path}/reviews`, { decision: "rejected", note: "Not yet", version: 2 });
  expect(decided.status()).toBe(201);
  expect((await decided.json()).criteriaVersion).toBe(2);
  expect((await (await author.get(`${path}/criteria-versions`)).json())[0]).toEqual({
    number: 2, criteria: ["Changed by the old API"], createdBy: "reviewer", createdAt: "2026-10-20T10:00:00Z",
  });

  // A requirement the previous API created has no version until the next save records it.
  await database.pool.query("DELETE FROM public.requirement_criteria_versions WHERE requirement_id = $1", [requirementId]);
  await database.pool.query("UPDATE public.requirement_reviews SET criteria_version = NULL WHERE requirement_id = $1", [requirementId]);
  expect((await (await author.get(path)).json()).criteriaVersion).toBeNull();
  const saved = await author.put(path, { title: "Box opens", acceptanceCriteria: ["Changed again"], version: 2 });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).criteriaVersion).toBe(2);
  expect((await (await author.get(`${path}/criteria-versions`)).json()).map((v: Version) => [v.number, v.criteria])).toEqual([
    [2, ["Changed again"]], [1, ["Changed by the old API"]],
  ]);
});

test("the migration protects and constrains versions, backfills version 1, and its rollback removes only the versions", async () => {
  const count = async (sql: string, values: unknown[] = []) => (await database.pool.query(sql, values)).rows[0].count;
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_criteria_versions' AND rowsecurity")).toBe(1);
  expect(await count("SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_name='requirement_criteria_versions' AND grantee IN ('anon','authenticated','PUBLIC')")).toBe(0);
  const { rows: [requirement] } = await database.pool.query("SELECT id FROM public.requirements ORDER BY created_at LIMIT 1");
  const insert = (values: Record<string, unknown>) => {
    const row = { requirement_id: requirement.id, number: 50, criteria: "[]", created_by: "author", ...values };
    const names = Object.keys(row);
    return database.pool.query(`INSERT INTO public.requirement_criteria_versions (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
  };
  await insert({});
  await expect(insert({})).rejects.toThrow(/duplicate key/);
  for (const values of [{ number: 0 }, { criteria: "{}" }, { criteria: null }, { created_by: null }]) {
    await expect(insert(values), JSON.stringify(values)).rejects.toThrow(/check constraint|not-null/);
  }
  await expect(insert({ number: 51, created_by: "nobody" })).rejects.toThrow(/foreign key/);
  await expect(database.pool.query("UPDATE public.requirement_reviews SET criteria_version = 0")).rejects.toThrow(/check constraint/);

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  const requirements = await count("SELECT count(*)::int AS count FROM public.requirements");
  const reviews = await count("SELECT count(*)::int AS count FROM public.requirement_reviews");
  await database.pool.query(await readFile("docs/schema/requirement-criteria-versions-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_criteria_versions'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='requirement_reviews' AND column_name='criteria_version'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirements")).toBe(requirements);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_reviews")).toBe(reviews);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);

  // Applied to existing data: version 1 holds each requirement's criteria in order, credited to its
  // last editor, and only decisions on the current requirement version are stamped with it.
  const { rows: [box] } = await database.pool.query(`SELECT r.id, r.version, r.updated_at FROM public.requirements r
    WHERE EXISTS (SELECT 1 FROM public.requirement_reviews v WHERE v.requirement_id = r.id) ORDER BY r.created_at LIMIT 1`);
  await database.pool.query(`INSERT INTO public.requirement_reviews (requirement_id,decision,note,requirement_version,evidence,decided_by) VALUES
    ($1,'accepted','',$2,'[]','reviewer'), ($1,'accepted','',$2 + 1,'[]','reviewer')`, [box.id, box.version]);
  await database.pool.query(await readFile("docs/schema/requirement-criteria-versions.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_criteria_versions")).toBe(requirements);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_criteria_versions WHERE number <> 1")).toBe(0);
  const { rows: [version] } = await database.pool.query("SELECT criteria, created_by, created_at FROM public.requirement_criteria_versions WHERE requirement_id = $1", [box.id]);
  const { rows: criteria } = await database.pool.query("SELECT text FROM public.acceptance_criteria WHERE requirement_id = $1 ORDER BY position", [box.id]);
  const { rows: [editor] } = await database.pool.query("SELECT coalesce(updated_by, created_by) AS id FROM public.requirements WHERE id = $1", [box.id]);
  expect(version).toEqual({ criteria: criteria.map(row => row.text), created_by: editor.id, created_at: box.updated_at });
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_reviews WHERE requirement_id = $1 AND requirement_version = $2 AND criteria_version = 1",
    [box.id, box.version])).toBeGreaterThan(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_reviews r JOIN public.requirements q ON q.id = r.requirement_id WHERE r.requirement_version <> q.version AND r.criteria_version IS NOT NULL")).toBe(0);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history);
});
