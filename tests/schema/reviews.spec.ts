import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// The review API (ADR-038) called directly, against a disposable PostgreSQL database.
// Evidence links are inserted as rows, so GitHub is not involved.
const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let nextNumber = 1;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('author','Author','author@example.invalid',true,now(),now()),
    ('reviewer','Reviewer','reviewer@example.invalid',true,now(),now()),
    ('second','Second','second@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  api = await startApi(5115, {
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
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

/** A project owned by the author, with two other members and one requirement the author wrote. */
async function setUp(request: APIRequestContext) {
  const author = await as(request, "author");
  const team = await (await author.post("/teams", { name: "Product team" })).json();
  const project = await (await author.post("/projects", { name: "Checkout", teamId: team.id })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query("INSERT INTO public.team_members (team_id,user_id) SELECT $1, unnest($2::text[])", [team.id, ["reviewer", "second"]]);
  const requirement = await (await author.post(`/projects/${project.id}/requirements`, { title: "Guest checkout" })).json();
  return { projectId: project.id as string, requirementId: requirement.id as string, path: `/requirements/${requirement.id}/reviews` };
}

/** Links an issue to the requirement directly in the database and returns the link's ID. */
async function linkIssue(requirementId: string, title: string, created: string) {
  const { rows: [row] } = await database.pool.query(`INSERT INTO public.requirement_evidence
    (requirement_id,kind,repository_id,repository_owner,repository_name,number,title,state,url,github_created_at,github_updated_at,linked_by)
    VALUES ($1,'issue',1,'acme','web',$2,$3,'open','https://github.com/acme/web/issues/1',$4,$4,'author') RETURNING id`,
  [requirementId, nextNumber++, title, created]);
  return row.id as string;
}

test("members who did not write the requirement record decisions, each with what was reviewed, newest first", async ({ request }) => {
  const { requirementId, path } = await setUp(request);
  const [reviewer, second, author] = [await as(request, "reviewer"), await as(request, "second"), await as(request, "author")];
  expect(await (await reviewer.get(path)).json()).toEqual([]);

  const issueId = await linkIssue(requirementId, "Guests cannot pay", "2026-09-01T10:00:00Z");
  const { rows: [commit] } = await database.pool.query(`INSERT INTO public.requirement_evidence
    (requirement_id,kind,repository_id,repository_owner,repository_name,sha,title,url,github_created_at,github_updated_at,linked_by)
    VALUES ($1,'commit',1,'acme','web',$2,'Add guest path','https://github.com/acme/web/commit/1','2026-09-02T10:00:00Z','2026-09-02T10:00:00Z','author') RETURNING id`,
  [requirementId, "abc1234".padEnd(40, "0")]);

  const recorded = await reviewer.post(path, { decision: "more_evidence", note: "  Needs a test run. ", version: 1 });
  expect(recorded.status()).toBe(201);
  const first = await recorded.json();
  expect(first).toMatchObject({
    requirementId, decision: "more_evidence", note: "Needs a test run.", requirementVersion: 1, decidedBy: "reviewer",
    evidence: [
      { id: issueId, kind: "issue", label: expect.stringMatching(/^#\d+$/), title: "Guests cannot pay", state: "open" },
      { id: commit.id, kind: "commit", label: "abc1234", title: "Add guest path", state: null },
    ],
  });
  expect(Date.parse(first.decidedAt)).not.toBeNaN();
  expect(recorded.headers().location).toBe(`${path}/${first.id}`);

  const accepted = await second.post(path, { decision: "accepted", version: 1 });
  expect(accepted.status()).toBe(201);
  expect(await accepted.json()).toMatchObject({ decision: "accepted", note: "", decidedBy: "second" });

  // What was reviewed stays as it was, whatever happens to the links afterwards.
  await database.pool.query("UPDATE public.requirement_evidence SET title = 'Renamed', state = 'closed' WHERE id = $1", [issueId]);
  await database.pool.query("DELETE FROM public.requirement_evidence WHERE id = $1", [commit.id]);
  const listed = await (await author.get(path)).json();
  expect(listed.map((r: { decision: string }) => r.decision)).toEqual(["accepted", "more_evidence"]);
  expect(listed[1]).toEqual(first);
  expect(listed[0].evidence).toHaveLength(2);

  // Decisions are only ever added.
  for (const response of [await reviewer.delete(`${path}/${first.id}`), await reviewer.put(`${path}/${first.id}`, { decision: "accepted", version: 1 })]) {
    expect([404, 405]).toContain(response.status());
  }
  expect(await (await reviewer.get(path)).json()).toEqual(listed);
});

test("the author, people outside the project, and anonymous callers cannot record a decision", async ({ request }) => {
  const { requirementId, path } = await setUp(request);
  const body = { decision: "accepted", version: 1 };

  const refused = await (await as(request, "author")).post(path, body);
  expect(refused.status()).toBe(403);
  expect((await refused.json()).detail).toBe("You created this requirement, so another project member has to review it.");
  expect((await (await as(request, "author")).get(path)).status()).toBe(200);

  const outsider = await as(request, "outsider");
  expect((await outsider.get(path)).status()).toBe(404);
  expect((await outsider.post(path, body)).status()).toBe(404);
  const reviewer = await as(request, "reviewer");
  expect((await reviewer.get("/requirements/00000000-0000-4000-8000-000000000000/reviews")).status()).toBe(404);
  expect((await reviewer.post("/requirements/00000000-0000-4000-8000-000000000000/reviews", body)).status()).toBe(404);
  expect((await request.get(`${api.baseURL}${path}`)).status()).toBe(401);
  expect((await request.post(`${api.baseURL}${path}`, { data: body })).status()).toBe(401);

  expect((await database.pool.query("SELECT count(*)::int AS count FROM public.requirement_reviews WHERE requirement_id = $1", [requirementId])).rows[0].count).toBe(0);
});

test("a decision needs a known choice, the version reviewed, and a reason unless it accepts", async ({ request }) => {
  const { requirementId, path } = await setUp(request);
  const reviewer = await as(request, "reviewer");
  const reason = "Say what is missing or wrong, so the team knows what to do next.";
  for (const [body, field, message] of [
    [{ decision: "approved", version: 1 }, "decision", "Choose accept, reject, or request more evidence."],
    [{ version: 1 }, "decision", "Choose accept, reject, or request more evidence."],
    [{ decision: "Accepted", version: 1 }, "decision", "Choose accept, reject, or request more evidence."],
    [{ decision: "rejected", version: 1 }, "note", reason],
    [{ decision: "rejected", note: "   ", version: 1 }, "note", reason],
    [{ decision: "more_evidence", note: "", version: 1 }, "note", reason],
    [{ decision: "accepted", note: "x".repeat(2001), version: 1 }, "note", "Use at most 2000 characters."],
    [{ decision: "accepted" }, "version", "Send the version you reviewed."],
    [{ decision: "accepted", version: 0 }, "version", "Send the version you reviewed."],
    [{ decision: "accepted", version: -1 }, "version", "Send the version you reviewed."],
  ] as const) {
    const response = await reviewer.post(path, body);
    expect(response.status(), JSON.stringify(body).slice(0, 80)).toBe(400);
    expect((await response.json()).errors[field][0], JSON.stringify(body).slice(0, 80)).toBe(message);
  }
  expect((await database.pool.query("SELECT count(*)::int AS count FROM public.requirement_reviews WHERE requirement_id = $1", [requirementId])).rows[0].count).toBe(0);

  expect((await reviewer.post(path, { decision: "accepted", note: "x".repeat(2000), version: 1 })).status()).toBe(201);
  expect((await reviewer.post(path, { decision: " rejected ", note: "No.", version: 1 })).status()).toBe(201);
});

test("a decision on a version the reviewer did not see, or on something archived, is refused", async ({ request }) => {
  const { projectId, requirementId, path } = await setUp(request);
  const [reviewer, author] = [await as(request, "reviewer"), await as(request, "author")];
  const stale = "This requirement changed since it was loaded. Reload it and review the current version.";

  const ahead = await reviewer.post(path, { decision: "accepted", version: 2 });
  expect(ahead.status()).toBe(409);
  expect((await ahead.json()).detail).toBe(stale);
  expect((await author.put(`/requirements/${requirementId}`, { title: "Guest checkout v2", version: 1 })).status()).toBe(200);
  const behind = await reviewer.post(path, { decision: "accepted", version: 1 });
  expect(behind.status()).toBe(409);
  expect((await behind.json()).detail).toBe(stale);
  const recorded = await reviewer.post(path, { decision: "accepted", version: 2 });
  expect(recorded.status()).toBe(201);
  expect((await recorded.json()).requirementVersion).toBe(2);

  expect((await author.post(`/requirements/${requirementId}/archive`)).status()).toBe(200);
  const archived = await reviewer.post(path, { decision: "rejected", note: "Late.", version: 2 });
  expect(archived.status()).toBe(409);
  expect((await archived.json()).detail).toBe("Archived items cannot be changed.");
  expect(await (await reviewer.get(path)).json()).toHaveLength(1);

  const other = await (await author.post(`/projects/${projectId}/requirements`, { title: "Saved carts" })).json();
  expect((await author.post(`/projects/${projectId}/archive`)).status()).toBe(200);
  expect((await reviewer.post(`/requirements/${other.id}/reviews`, { decision: "accepted", version: 1 })).status()).toBe(409);
  expect(await (await reviewer.get(`/requirements/${other.id}/reviews`)).json()).toEqual([]);
});

test("requirement lists carry the latest decision and whether it still describes the requirement", async ({ request }) => {
  const { projectId, requirementId, path } = await setUp(request);
  const [reviewer, author] = [await as(request, "reviewer"), await as(request, "author")];
  const other = await (await author.post(`/projects/${projectId}/requirements`, { title: "Saved carts" })).json();
  const review = async (id = requirementId) =>
    (await (await author.get(`/projects/${projectId}/requirements`)).json()).find((r: { id: string }) => r.id === id).review;
  expect(await review()).toBeNull();

  const first = await linkIssue(requirementId, "Guests cannot pay", "2026-09-01T10:00:00Z");
  const decided = await (await reviewer.post(path, { decision: "accepted", version: 1 })).json();
  expect(await review()).toEqual({ decision: "accepted", decidedBy: "reviewer", decidedAt: decided.decidedAt, outdated: false });
  expect(await review(other.id)).toBeNull();

  // The same link read again from GitHub is still the link that was reviewed.
  await database.pool.query("UPDATE public.requirement_evidence SET title = 'Renamed', state = 'closed', github_updated_at = now() WHERE id = $1", [first]);
  expect((await review()).outdated).toBe(false);

  const added = await linkIssue(requirementId, "Add guest checkout", "2026-09-02T10:00:00Z");
  expect((await review()).outdated).toBe(true);
  await database.pool.query("DELETE FROM public.requirement_evidence WHERE id = $1", [added]);
  expect((await review()).outdated).toBe(false);
  // The same number of links, but not the same links.
  await database.pool.query("DELETE FROM public.requirement_evidence WHERE id = $1", [first]);
  await linkIssue(requirementId, "A different issue", "2026-09-03T10:00:00Z");
  expect((await review()).outdated).toBe(true);
  // Links on another requirement do not count.
  await linkIssue(other.id, "Elsewhere", "2026-09-04T10:00:00Z");

  expect((await reviewer.post(path, { decision: "rejected", note: "Wrong issue.", version: 1 })).status()).toBe(201);
  expect(await review()).toMatchObject({ decision: "rejected", outdated: false });
  expect((await author.put(`/requirements/${requirementId}`, { title: "Guest checkout v2", version: 1 })).status()).toBe(200);
  expect(await review()).toMatchObject({ decision: "rejected", outdated: true });
  expect(await review(other.id)).toBeNull();
});

test("requirement lists count each requirement's evidence links of every kind", async ({ request }) => {
  const { projectId, requirementId } = await setUp(request);
  const author = await as(request, "author");
  const other = await (await author.post(`/projects/${projectId}/requirements`, { title: "Saved carts" })).json();
  const counts = async () => Object.fromEntries((await (await author.get(`/projects/${projectId}/requirements`)).json())
    .map((r: { id: string; evidenceCount: number }) => [r.id, r.evidenceCount]));
  expect(await counts()).toEqual({ [requirementId]: 0, [other.id]: 0 });

  const issue = await linkIssue(requirementId, "Guests cannot pay", "2026-09-01T10:00:00Z");
  expect(await counts()).toEqual({ [requirementId]: 1, [other.id]: 0 });
  await database.pool.query(`INSERT INTO public.requirement_evidence
    (requirement_id,kind,repository_id,repository_owner,repository_name,sha,title,url,github_created_at,github_updated_at,linked_by)
    VALUES ($1,'commit',1,'acme','web',$2,'Add guest path','https://github.com/acme/web/commit/1',now(),now(),'author')`,
  [requirementId, "def5678".padEnd(40, "0")]);
  await database.pool.query(`INSERT INTO public.requirement_evidence
    (requirement_id,kind,repository_id,repository_owner,repository_name,tag,title,url,github_created_at,github_updated_at,linked_by)
    VALUES ($1,'release',1,'acme','web','v1.0.0','First release','https://github.com/acme/web/releases/tag/v1.0.0',now(),now(),'author')`, [requirementId]);
  await linkIssue(other.id, "Elsewhere", "2026-09-02T10:00:00Z");
  expect(await counts()).toEqual({ [requirementId]: 3, [other.id]: 1 });

  await database.pool.query("DELETE FROM public.requirement_evidence WHERE id = $1", [issue]);
  expect(await counts()).toEqual({ [requirementId]: 2, [other.id]: 1 });
});

test("the migration protects the new table, constrains its rows, and its rollback removes only that table", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_reviews' AND rowsecurity")).toBe(1);
  expect(await count("SELECT count(*)::int AS count FROM pg_policies WHERE tablename='requirement_reviews'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_name='requirement_reviews' AND grantee IN ('anon','authenticated','PUBLIC')")).toBe(0);

  const { rows: [reviewed] } = await database.pool.query("SELECT requirement_id AS id FROM public.requirement_reviews LIMIT 1");
  const insert = (values: Record<string, unknown>) => {
    const row = { requirement_id: reviewed.id, decision: "accepted", note: "", requirement_version: 1, evidence: "[]", decided_by: "reviewer", ...values };
    const names = Object.keys(row);
    return database.pool.query(`INSERT INTO public.requirement_reviews (${names.join(",")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(row));
  };
  await insert({});
  await insert({ decision: "rejected", note: "Why" });
  for (const values of [{ decision: "verified" }, { decision: "rejected" }, { decision: "more_evidence", note: "  " }, { requirement_version: 0 },
    { evidence: "{}" }, { evidence: "null" }, { decision: null }, { evidence: null }, { decided_by: null }]) {
    await expect(insert(values), JSON.stringify(values)).rejects.toThrow(/check constraint|not-null/);
  }
  await expect(insert({ requirement_id: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/foreign key/);
  await expect(insert({ decided_by: "nobody" })).rejects.toThrow(/foreign key/);
  // A reviewed requirement and the person who reviewed it cannot be deleted from under the decision.
  await expect(database.pool.query("DELETE FROM public.requirements WHERE id = $1", [reviewed.id])).rejects.toThrow(/foreign key/);
  await expect(database.pool.query(`DELETE FROM public."user" WHERE id = 'second'`)).rejects.toThrow(/foreign key/);

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  await database.pool.query(await readFile("docs/schema/requirement-reviews-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_reviews'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename IN ('requirements','requirement_evidence','project_repositories')")).toBe(3);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);
  expect(history).toBe(12);
});
