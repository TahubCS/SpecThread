import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// The product API (ADR-024) against a disposable PostgreSQL database. Tokens come from
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

async function createProject(request: APIRequestContext, name = "Checkout") {
  const owner = await as(request, "owner");
  const response = await owner.post("/projects", { name });
  expect(response.status()).toBe(201);
  const project = await response.json();
  expect((await owner.post(`/projects/${project.id}/members`, { email: "member@example.invalid" })).status()).toBe(201);
  return project as { id: string };
}

test("owners create, list, rename, and archive projects", async ({ request }) => {
  const owner = await as(request, "owner");
  const created = await owner.post("/projects", { name: "  Billing  " });
  expect(created.status()).toBe(201);
  const project = await created.json();
  expect(project).toMatchObject({ name: "Billing", ownerUserId: "owner", archivedAt: null });
  expect(created.headers().location).toBe(`/projects/${project.id}`);
  // Write responses carry the stored timestamp, not a higher-precision in-memory one.
  expect((await (await owner.get(`/projects/${project.id}`)).json()).createdAt).toBe(project.createdAt);

  const { rows } = await database.pool.query("SELECT user_id FROM public.project_members WHERE project_id = $1", [project.id]);
  expect(rows).toEqual([{ user_id: "owner" }]);

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

test("owners add existing verified accounts by email and members see each other", async ({ request }) => {
  const owner = await as(request, "owner");
  const project = await (await owner.post("/projects", { name: "Members" })).json();
  const added = await owner.post(`/projects/${project.id}/members`, { email: "  Second@Example.INVALID " });
  expect(added.status()).toBe(201);
  expect(added.headers().location).toBe(`/projects/${project.id}/members/second`);
  expect(await added.json()).toMatchObject({ userId: "second", name: "Second", email: "second@example.invalid", isOwner: false });

  const second = await as(request, "second");
  expect((await second.post(`/projects/${project.id}/requirements`, { title: "Shared work" })).status()).toBe(201);
  const members = await (await second.get(`/projects/${project.id}/members`)).json();
  expect(members.map((m: { userId: string; isOwner: boolean }) => [m.userId, m.isOwner])).toEqual([["owner", true], ["second", false]]);

  expect((await owner.post(`/projects/${project.id}/members`, { email: "second@example.invalid" })).status()).toBe(409);
  for (const email of ["nobody@example.invalid", "unverified@example.invalid", " "]) {
    const rejected = await owner.post(`/projects/${project.id}/members`, { email });
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).errors).toHaveProperty("email");
  }
  expect((await second.post(`/projects/${project.id}/members`, { email: "member@example.invalid" })).status()).toBe(403);
  const outsider = await as(request, "outsider");
  expect((await outsider.get(`/projects/${project.id}/members`)).status()).toBe(404);
  expect((await outsider.post(`/projects/${project.id}/members`, { email: "outsider@example.invalid" })).status()).toBe(404);
});

test("members can leave, only the owner removes others, and the owner stays", async ({ request }) => {
  const project = await createProject(request, "Removals");
  const owner = await as(request, "owner");
  const member = await as(request, "member");
  await owner.post(`/projects/${project.id}/members`, { email: "second@example.invalid" });

  expect((await member.delete(`/projects/${project.id}/members/second`)).status()).toBe(403);
  expect((await member.delete(`/projects/${project.id}/members/owner`)).status()).toBe(403);
  expect((await owner.delete(`/projects/${project.id}/members/owner`)).status()).toBe(409);
  expect((await owner.delete(`/projects/${project.id}/members/outsider`)).status()).toBe(404);

  expect((await member.delete(`/projects/${project.id}/members/member`)).status()).toBe(204);
  expect((await member.get(`/projects/${project.id}`)).status()).toBe(404);
  expect((await owner.delete(`/projects/${project.id}/members/second`)).status()).toBe(204);
  expect((await (await as(request, "second")).get(`/projects/${project.id}/requirements`)).status()).toBe(404);
  expect(await (await owner.get(`/projects/${project.id}/members`)).json()).toEqual([expect.objectContaining({ userId: "owner" })]);

  await owner.post(`/projects/${project.id}/archive`);
  expect((await owner.post(`/projects/${project.id}/members`, { email: "member@example.invalid" })).status()).toBe(409);
});
