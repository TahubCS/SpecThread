import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// Requirement comments (ADR-059), called directly against a disposable PostgreSQL database.
const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;

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
  api = await startApi(5134, {
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
    patch: (path: string, data?: object) => request.patch(url(path), { headers, data }),
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

/** A team owned by "owner" with one user in each other role, a project, and a requirement written by "member". */
async function setUp(request: APIRequestContext) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name: "Comment team" })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query(`INSERT INTO public.team_members (team_id,user_id,role) VALUES
    ($1,'admin','admin'),($1,'member','member'),($1,'reviewer','reviewer'),($1,'observer','observer')`, [team.id]);
  const project = await (await owner.post("/projects", { name: "Checkout", teamId: team.id })).json();
  const member = await as(request, "member");
  const requirement = await (await member.post(`/projects/${project.id}/requirements`, { title: "Guest checkout", acceptanceCriteria: ["Done"] })).json();
  return { projectId: project.id as string, requirementId: requirement.id as string, path: `/requirements/${requirement.id}/comments` };
}

test("every team role, Observers included, comments and replies without changing the requirement or its review", async ({ request }) => {
  const { requirementId, path } = await setUp(request);
  const member = await as(request, "member");
  expect((await member.post(`/requirements/${requirementId}/reviews`, { decision: "accepted", version: 1 })).status()).toBe(201);
  const before = await (await member.get(`/requirements/${requirementId}`)).json();
  const reviewsBefore = await (await member.get(`/requirements/${requirementId}/reviews`)).json();
  expect(reviewsBefore).toHaveLength(1);

  const observer = await as(request, "observer");
  const asked = await observer.post(path, { body: "  Is this covered by the sprint demo?  " });
  expect(asked.status()).toBe(201);
  const question = await asked.json();
  expect(question).toMatchObject({ parentId: null, authorId: "observer", body: "Is this covered by the sprint demo?", editedAt: null, deletedAt: null });
  for (const sub of ["reviewer", "member", "admin", "owner"]) {
    const response = await (await as(request, sub)).post(path, { body: `Reply from ${sub}`, parentId: question.id });
    expect(response.status(), sub).toBe(201);
    expect(await response.json()).toMatchObject({ parentId: question.id, authorId: sub });
  }

  // Discussion never touches the requirement, its version, its decisions, or its status.
  const after = await (await member.get(`/requirements/${requirementId}`)).json();
  expect(after).toEqual(before);
  expect(await (await member.get(`/requirements/${requirementId}/reviews`)).json()).toEqual(reviewsBefore);

  const listed = await (await observer.get(path)).json();
  expect(listed.comments.map((c: { authorId: string }) => c.authorId)).toEqual(["observer", "reviewer", "member", "admin", "owner"]);
  expect(listed.history).toHaveLength(5);
  expect(listed.history.every((e: { action: string }) => e.action === "created")).toBe(true);
  expect(listed.history.at(-1)).toMatchObject({ commentId: question.id, parentId: null, authorId: "observer", actor: "observer" });
});

test("comments are validated, replies stay one level deep, and non-members see nothing", async ({ request }) => {
  const { path } = await setUp(request);
  const member = await as(request, "member");
  expect((await member.post(path, { body: "   " })).status()).toBe(400);
  expect((await member.post(path, { body: "x".repeat(5_001) })).status()).toBe(400);
  expect((await member.post(path, { body: "x".repeat(5_000) })).status()).toBe(201);
  expect((await member.post(path, { body: "Hi", parentId: "00000000-0000-4000-8000-000000000000" })).status()).toBe(400);
  const top = await (await member.post(path, { body: "Topic" })).json();
  const reply = await (await member.post(path, { body: "Answer", parentId: top.id })).json();
  const nested = await member.post(path, { body: "Deeper", parentId: reply.id });
  expect(nested.status()).toBe(400);
  expect((await nested.json()).errors.parentId).toEqual(["Reply to the original comment instead."]);

  const outsider = await as(request, "outsider");
  expect((await outsider.get(path)).status()).toBe(404);
  expect((await outsider.post(path, { body: "Let me in" })).status()).toBe(404);
  expect((await outsider.patch(`${path}/${top.id}`, { body: "Mine now" })).status()).toBe(404);
  expect((await outsider.delete(`${path}/${top.id}`)).status()).toBe(404);
});

test("only authors edit; authors, the Owner, and Admins delete; each change is recorded without earlier text", async ({ request }) => {
  const { path } = await setUp(request);
  const [member, reviewer, observer, admin] = await Promise.all(["member", "reviewer", "observer", "admin"].map(sub => as(request, sub)));
  const comment = await (await reviewer.post(path, { body: "First draft" })).json();
  const reply = await (await member.post(path, { body: "Answer", parentId: comment.id })).json();

  for (const other of [member, admin]) {
    const response = await other.patch(`${path}/${comment.id}`, { body: "Not mine" });
    expect(response.status()).toBe(403);
    expect((await response.json()).detail).toBe("Only the author can edit a comment.");
  }
  const edited = await reviewer.patch(`${path}/${comment.id}`, { body: "Second draft" });
  expect(edited.status()).toBe(200);
  expect(await edited.json()).toMatchObject({ body: "Second draft", editedAt: expect.any(String) });
  // Saving the same text again is not an edit.
  expect((await reviewer.patch(`${path}/${comment.id}`, { body: "Second draft" })).status()).toBe(200);
  expect((await reviewer.patch(`${path}/${comment.id}`, { body: " " })).status()).toBe(400);

  for (const other of [member, observer]) {
    const response = await other.delete(`${path}/${comment.id}`);
    expect(response.status()).toBe(403);
    expect((await response.json()).detail).toBe("Only the author, the Owner, or an Admin can delete a comment.");
  }
  expect((await admin.delete(`${path}/${comment.id}`)).status()).toBe(204);
  expect((await admin.delete(`${path}/${comment.id}`)).status()).toBe(404);
  expect((await reviewer.patch(`${path}/${comment.id}`, { body: "Back again" })).status()).toBe(409);
  const late = await member.post(path, { body: "Late reply", parentId: comment.id });
  expect(late.status()).toBe(409);
  expect((await member.delete(`${path}/${reply.id}`)).status()).toBe(204);

  const { comments, history } = await (await observer.get(path)).json();
  // The deleted comment keeps its place, but its text is gone.
  expect(comments.find((c: { id: string }) => c.id === comment.id)).toMatchObject({ body: "", deletedBy: "admin", deletedAt: expect.any(String) });
  expect(history.map((e: { action: string; actor: string; authorId: string }) => [e.action, e.actor, e.authorId])).toEqual([
    ["deleted", "member", "member"], ["deleted", "admin", "reviewer"], ["edited", "reviewer", "reviewer"],
    ["created", "member", "member"], ["created", "reviewer", "reviewer"],
  ]);
  const { rows } = await database.pool.query("SELECT count(*)::int AS count FROM public.requirement_comments WHERE body LIKE '%draft%'");
  expect(rows[0].count).toBe(0);
});

test("an archived requirement's discussion is read-only", async ({ request }) => {
  const { requirementId, path } = await setUp(request);
  const member = await as(request, "member");
  const comment = await (await member.post(path, { body: "Before archiving" })).json();
  expect((await member.post(`/requirements/${requirementId}/archive`)).status()).toBe(200);
  for (const response of [
    await member.post(path, { body: "After" }), await member.patch(`${path}/${comment.id}`, { body: "Changed" }),
    await member.delete(`${path}/${comment.id}`),
  ]) {
    expect(response.status()).toBe(409);
  }
  expect((await (await member.get(path)).json()).comments).toHaveLength(1);
});

test("the migration protects and constrains both tables, and its rollback removes only them", async ({ request }) => {
  const count = async (sql: string, values: unknown[] = []) => (await database.pool.query(sql, values)).rows[0].count;
  for (const table of ["requirement_comments", "requirement_comment_events"]) {
    expect(await count(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename=$1 AND rowsecurity`, [table])).toBe(1);
    expect(await count(`SELECT count(*)::int AS count FROM information_schema.table_privileges
      WHERE table_schema='public' AND table_name=$1 AND grantee IN ('anon','authenticated','PUBLIC')`, [table])).toBe(0);
  }
  // Two bare requirements of this test's own, with nothing else referring to them: one gets a
  // comment row only and one an event row only, so each foreign key is checked on its own.
  const { projectId } = await setUp(request);
  const { rows: [{ id: commented }, { id: logged }] } = await database.pool.query(`INSERT INTO public.requirements
    (id,project_id,title,description,created_by) VALUES (gen_random_uuid(),$1,'Commented','','member'),(gen_random_uuid(),$1,'Logged','','member')
    RETURNING id`, [projectId]);
  const { rows: [comment] } = await database.pool.query(
    "INSERT INTO public.requirement_comments (requirement_id,author_id,body) VALUES ($1,'member','Direct') RETURNING id", [commented]);
  await expect(database.pool.query("INSERT INTO public.requirement_comments (requirement_id,author_id,body) VALUES ($1,'owner',$2)", [commented, "x".repeat(5_001)]))
    .rejects.toThrow(/ck_requirement_comments_body/);
  await expect(database.pool.query("INSERT INTO public.requirement_comments (requirement_id,author_id,body,deleted_at,deleted_by) VALUES ($1,'owner','kept',now(),'owner')", [commented]))
    .rejects.toThrow(/ck_requirement_comments_deleted/);
  await expect(database.pool.query("INSERT INTO public.requirement_comments (requirement_id,author_id,body) VALUES ($1,'nobody','Hi')", [commented]))
    .rejects.toThrow(/FK_requirement_comments_user_author_id/);
  await expect(database.pool.query("INSERT INTO public.requirement_comment_events (requirement_id,comment_id,action,actor) VALUES ($1,$2,'renamed','owner')", [logged, comment.id]))
    .rejects.toThrow(/ck_requirement_comment_events_action/);
  await database.pool.query("INSERT INTO public.requirement_comment_events (requirement_id,comment_id,action,actor) VALUES ($1,$2,'created','member')", [logged, comment.id]);
  await expect(database.pool.query("DELETE FROM public.requirements WHERE id = $1", [commented]))
    .rejects.toThrow(/FK_requirement_comments_requirements_requirement_id/);
  await expect(database.pool.query("DELETE FROM public.requirements WHERE id = $1", [logged]))
    .rejects.toThrow(/FK_requirement_comment_events_requirements_requirement_id/);

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  const requirements = await count("SELECT count(*)::int AS count FROM public.requirements");
  await database.pool.query(await readFile("docs/schema/requirement-comments-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'requirement_comment%'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirements")).toBe(requirements);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);
});
