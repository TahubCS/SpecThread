import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// The product API (ADR-040) against a disposable PostgreSQL database. Tokens come from
// the test JWKS issuer that Playwright starts for every run (scripts/start-test-jwks.mjs).
const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('second','Second','second@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now()),
    ('unverified','Unverified','unverified@example.invalid',false,now(),now())`);
  await database.pool.query(`INSERT INTO user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user" WHERE "emailVerified"`);
  const url = new URL(database.connectionString);
  const connection = `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`;
  api = await startApi(5105, { ConnectionStrings__Database: connection, Auth__Issuer: issuer });
});
test.afterAll(async () => {
  api?.stop();
  await database?.stop();
});

async function as(request: APIRequestContext, sub: string) {
  const minted = await request.post(`${issuer}/sign`, { data: { claims: { sub } } });
  expect(minted.status()).toBe(200);
  const headers = { authorization: `Bearer ${(await minted.json()).token}` };
  const url = (path: string) => `${api.baseURL}${path}`;
  return {
    get: (path: string) => request.get(url(path), { headers }),
    post: (path: string, data?: object) => request.post(url(path), { headers, data }),
    put: (path: string, data: object) => request.put(url(path), { headers, data }),
    patch: (path: string, data: object) => request.patch(url(path), { headers, data }),
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

async function createTeam(request: APIRequestContext, name = "Product team") {
  const owner = await as(request, "owner");
  const created = await owner.post("/teams", { name });
  expect(created.status()).toBe(201);
  const team = await created.json();
  // Fixture-only memberships. Product joins require invitation acceptance.
  await database.pool.query("INSERT INTO team_members(team_id,user_id,role) VALUES ($1,'member','member'),($1,'second','admin')", [team.id]);
  return team as { id: string };
}

async function createProject(request: APIRequestContext, name = "Checkout") {
  const team = await createTeam(request);
  const owner = await as(request, "owner");
  const response = await owner.post("/projects", { name, teamId: team.id });
  expect(response.status()).toBe(201);
  return await response.json() as { id: string; teamId: string };
}

test("owners create, list, rename, and archive projects", async ({ request }) => {
  const owner = await as(request, "owner");
  const team = await createTeam(request, "Billing team");
  const created = await owner.post("/projects", { name: "  Billing  ", teamId: team.id, ownerUserId: "outsider", teamRole: "admin" });
  expect(created.status()).toBe(201);
  const project = await created.json();
  expect(project).toMatchObject({ name: "Billing", ownerUserId: "owner", archivedAt: null, teamId: team.id, teamName: "Billing team", teamRole: "owner", requirementCount: 0 });
  expect(created.headers().location).toBe(`/projects/${project.id}`);
  // Write responses carry the stored timestamp, not a higher-precision in-memory one.
  expect((await (await owner.get(`/projects/${project.id}`)).json()).createdAt).toBe(project.createdAt);

  const { rows } = await database.pool.query("SELECT user_id FROM public.project_members WHERE project_id = $1", [project.id]);
  expect(rows).toEqual([]); // Access comes from team membership, not project rows.

  expect((await (await owner.get("/projects")).json()).map((p: { id: string }) => p.id)).toContain(project.id);
  const renamed = await owner.patch(`/projects/${project.id}`, { name: "Billing v2" });
  expect(await renamed.json()).toMatchObject({ name: "Billing v2" });

  const archived = await (await owner.post(`/projects/${project.id}/archive`)).json();
  expect(archived.archivedAt).not.toBeNull();
  const again = await (await owner.post(`/projects/${project.id}/archive`)).json();
  expect(again.archivedAt).toBe(archived.archivedAt);
  expect((await (await owner.get("/projects")).json()).map((p: { id: string }) => p.id)).not.toContain(project.id);
  expect((await owner.get(`/projects/${project.id}`)).status()).toBe(200);
  expect((await owner.patch(`/projects/${project.id}`, { name: "Late" })).status()).toBe(409);
  expect((await owner.post(`/projects/${project.id}/requirements`, { title: "Late" })).status()).toBe(409);
});

test("members can read and write requirements but cannot manage the project", async ({ request }) => {
  const project = await createProject(request);
  const member = await as(request, "member");
  expect((await member.get(`/projects/${project.id}`)).status()).toBe(200);
  expect((await member.patch(`/projects/${project.id}`, { name: "Mine" })).status()).toBe(403);
  expect((await member.post(`/projects/${project.id}/archive`)).status()).toBe(403);
  expect((await member.post(`/projects/${project.id}/requirements`, { title: "Pay by card" })).status()).toBe(201);
});

test("non-members cannot tell that a project or requirement exists", async ({ request }) => {
  const project = await createProject(request);
  const owner = await as(request, "owner");
  const requirement = await (await owner.post(`/projects/${project.id}/requirements`, { title: "Refunds" })).json();
  const outsider = await as(request, "outsider");
  const missing = "00000000-0000-0000-0000-000000000000";
  for (const response of [
    await outsider.get(`/projects/${project.id}`),
    await outsider.patch(`/projects/${project.id}`, { name: "Taken" }),
    await outsider.get(`/projects/${project.id}/requirements`),
    await outsider.post(`/projects/${project.id}/requirements`, { title: "Sneaky" }),
    await outsider.get(`/requirements/${requirement.id}`),
    await outsider.put(`/requirements/${requirement.id}`, { title: "Sneaky", version: 1 }),
    await outsider.post(`/requirements/${requirement.id}/archive`),
    await owner.get(`/requirements/${missing}`),
  ]) expect(response.status()).toBe(404);
  expect(await (await outsider.get("/projects")).json()).not.toContainEqual(expect.objectContaining({ id: project.id }));
});

test("requirements keep ordered acceptance criteria and reject stale updates", async ({ request }) => {
  const project = await createProject(request);
  const owner = await as(request, "owner");
  const member = await as(request, "member");
  const created = await owner.post(`/projects/${project.id}/requirements`, {
    title: "Guest checkout", description: "Buy without an account.", acceptanceCriteria: ["Email is required", "Card is charged once"],
  });
  expect(created.status()).toBe(201);
  const requirement = await created.json();
  expect(requirement).toMatchObject({ version: 1, createdBy: "owner", description: "Buy without an account." });
  expect(requirement.acceptanceCriteria.map((c: { text: string }) => c.text)).toEqual(["Email is required", "Card is charged once"]);

  const updated = await member.put(`/requirements/${requirement.id}`, {
    title: "Guest checkout", description: "", acceptanceCriteria: ["Card is charged once", "Receipt is emailed", "Email is required"], version: 1,
  });
  expect(updated.status()).toBe(200);
  const fetched = await (await owner.get(`/requirements/${requirement.id}`)).json();
  expect(fetched.version).toBe(2);
  expect(fetched.createdAt).toBe(requirement.createdAt);
  expect(fetched.updatedAt).toBe((await updated.json()).updatedAt);
  expect(fetched.acceptanceCriteria.map((c: { text: string; position: number }) => [c.position, c.text])).toEqual([
    [0, "Card is charged once"], [1, "Receipt is emailed"], [2, "Email is required"],
  ]);

  const stale = await owner.put(`/requirements/${requirement.id}`, { title: "Overwrite", acceptanceCriteria: [], version: 1 });
  expect(stale.status()).toBe(409);
  expect((await (await owner.get(`/requirements/${requirement.id}`)).json()).title).toBe("Guest checkout");

  const list = await (await owner.get(`/projects/${project.id}/requirements`)).json();
  expect(list).toEqual([expect.objectContaining({ id: requirement.id, version: 2 })]);
  const archived = await owner.post(`/requirements/${requirement.id}/archive`);
  const archivedAt = (await archived.json()).archivedAt;
  expect(archivedAt).not.toBeNull();
  expect((await (await owner.get(`/requirements/${requirement.id}`)).json()).archivedAt).toBe(archivedAt);
  expect(await (await owner.get(`/projects/${project.id}/requirements`)).json()).toEqual([]);
  expect((await owner.put(`/requirements/${requirement.id}`, { title: "Revive", version: 2 })).status()).toBe(409);
});

test("invalid input is rejected with field errors", async ({ request }) => {
  const project = await createProject(request);
  const owner = await as(request, "owner");
  const blank = await owner.post("/projects", { name: "   " });
  expect(blank.status()).toBe(400);
  expect((await blank.json()).errors).toHaveProperty("name");

  const invalid = await owner.post(`/projects/${project.id}/requirements`, {
    title: "x".repeat(201), description: "d".repeat(10_001), acceptanceCriteria: ["ok", " "],
  });
  expect(invalid.status()).toBe(400);
  expect(Object.keys((await invalid.json()).errors).sort()).toEqual(["acceptanceCriteria[1]", "description", "title"]);

  const tooMany = await owner.post(`/projects/${project.id}/requirements`, { title: "Many", acceptanceCriteria: Array(51).fill("c") });
  expect((await tooMany.json()).errors).toHaveProperty("acceptanceCriteria");

  const created = await (await owner.post(`/projects/${project.id}/requirements`, { title: "Valid" })).json();
  const noVersion = await owner.put(`/requirements/${created.id}`, { title: "Valid" });
  expect((await noVersion.json()).errors).toHaveProperty("version");
  expect((await owner.get(`/projects/not-a-guid`)).status()).toBe(404);
});

test("anonymous requests and tokens without an account record are refused", async ({ request }) => {
  expect((await request.get(`${api.baseURL}/projects`)).status()).toBe(401);
  const ghost = await as(request, "no-such-user");
  expect((await ghost.post("/projects", { name: "Ghost" })).status()).toBe(403);
  expect(await (await ghost.get("/projects")).json()).toEqual([]);
});

test("project lists inherit team membership, count active requirements, and isolate archives", async ({ request }) => {
  const project = await createProject(request, "Inherited project");
  const owner = await as(request, "owner");
  const member = await as(request, "member");
  const otherTeam = await createTeam(request, "Separate team");
  const other = await (await owner.post("/projects", { name: "Other project", teamId: otherTeam.id })).json();
  const first = await (await member.post(`/projects/${project.id}/requirements`, { title: "Active requirement" })).json();
  const second = await (await member.post(`/projects/${project.id}/requirements`, { title: "Archived requirement" })).json();
  await member.post(`/requirements/${second.id}/archive`);
  expect(await (await member.get(`/teams/${project.teamId}/projects`)).json()).toEqual([
    expect.objectContaining({ id: project.id, requirementCount: 1, teamRole: "member" }),
  ]);
  const members = await (await member.get(`/projects/${project.id}/members`)).json();
  expect(members.map((m: { userId: string; role: string }) => [m.userId, m.role])).toEqual([
    ["owner", "owner"], ["member", "member"], ["second", "admin"],
  ]);
  await owner.post(`/projects/${project.id}/archive`);
  expect(await (await member.get(`/teams/${project.teamId}/projects`)).json()).toEqual([]);
  expect(await (await member.get(`/teams/${project.teamId}/projects?archived=true`)).json()).toEqual([
    expect.objectContaining({ id: project.id, requirementCount: 1 }),
  ]);
  expect((await member.post(`/projects/${project.id}/restore`)).status()).toBe(403);
  expect((await owner.post(`/projects/${project.id}/restore`)).status()).toBe(200);
  expect(await (await member.get(`/requirements/${first.id}`)).json()).toMatchObject({ title: "Active requirement" });
  const outsider = await as(request, "outsider");
  expect((await outsider.get(`/teams/${project.teamId}/projects?archived=true`)).status()).toBe(404);
  expect((await member.get(`/teams/00000000-0000-0000-0000-000000000000/projects`)).status()).toBe(404);
  expect(await (await owner.get(`/teams/${otherTeam.id}/projects`)).json()).toEqual([expect.objectContaining({ id: other.id })]);
});

test("Owner and Admin manage all team projects; historical creators do not retain management after demotion", async ({ request }) => {
  const team = await createTeam(request, "Managed team");
  const admin = await as(request, "second");
  const member = await as(request, "member");
  const owner = await as(request, "owner");
  expect((await member.post("/projects", { name: "Forbidden", teamId: team.id })).status()).toBe(403);
  expect((await owner.post("/projects", { name: "No team" })).status()).toBe(400);
  expect((await owner.post("/projects", { name: "Unknown", teamId: "00000000-0000-0000-0000-000000000001" })).status()).toBe(404);
  const created = await admin.post("/projects", { name: "Admin project", teamId: team.id });
  expect(created.status()).toBe(201);
  const project = await created.json();
  expect(project).toMatchObject({ teamRole: "admin", ownerUserId: "second" });
  expect((await owner.patch(`/projects/${project.id}`, { name: "Owner rename", teamId: "00000000-0000-0000-0000-000000000001" })).status()).toBe(200);
  expect((await admin.post(`/projects/${project.id}/archive`)).status()).toBe(200);
  expect((await admin.post(`/projects/${project.id}/restore`)).status()).toBe(200);
  await database.pool.query("UPDATE team_members SET role='member' WHERE team_id=$1 AND user_id='second'", [team.id]);
  expect((await admin.patch(`/projects/${project.id}`, { name: "Creator bypass" })).status()).toBe(403);
  expect((await admin.post(`/projects/${project.id}/archive`)).status()).toBe(403);
  expect((await admin.post(`/projects/${project.id}/requirements`, { title: "Still a member" })).status()).toBe(201);
});

test("legacy project membership writes cannot bypass invitation acceptance, and team removal revokes all access", async ({ request }) => {
  const project = await createProject(request, "Revocation");
  const owner = await as(request, "owner");
  const member = await as(request, "member");
  const outsider = await as(request, "outsider");
  const requirement = await (await owner.post(`/projects/${project.id}/requirements`, { title: "Private" })).json();
  for (const caller of [owner, member]) {
    expect((await caller.post(`/projects/${project.id}/members`, { email: "outsider@example.invalid" })).status()).toBe(410);
    expect((await caller.delete(`/projects/${project.id}/members/member`)).status()).toBe(410);
  }
  expect((await outsider.post(`/projects/${project.id}/members`, { email: "outsider@example.invalid" })).status()).toBe(404);
  // Even a stale legacy membership does not grant access after leaving the team.
  await database.pool.query("INSERT INTO project_members(project_id,user_id) VALUES ($1,'member'),($1,'outsider')", [project.id]);
  expect((await outsider.get(`/projects/${project.id}`)).status()).toBe(404);
  await database.pool.query("DELETE FROM team_members WHERE team_id=$1 AND user_id='member'", [project.teamId]);
  for (const response of [
    await member.get(`/projects/${project.id}`), await member.get(`/projects/${project.id}/members`),
    await member.get(`/requirements/${requirement.id}`),
    await member.put(`/requirements/${requirement.id}`, { title: "Revoked", version: 1 }),
  ]) expect(response.status()).toBe(404);
  expect(await (await member.get("/projects")).json()).not.toContainEqual(expect.objectContaining({ id: project.id }));
});
