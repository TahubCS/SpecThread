import { expect, test, type APIRequestContext } from "@playwright/test";
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
    ('owner','Owner','owner@example.invalid',true,now(),now()),('admin','Admin','admin@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),('another-admin','Another admin','another@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now());
    INSERT INTO user_onboarding(user_id,completed_at) SELECT id,now() FROM public."user";`);
  const url = new URL(database.connectionString);
  api = await startApi(5108, { Auth__Issuer: issuer,
    ConnectionStrings__Database: `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}` });
});
test.afterAll(async () => { api?.stop(); await database?.stop(); });
async function as(request: APIRequestContext, sub: string) {
  const minted = await request.post(`${issuer}/sign`, { data: { claims: { sub } } });
  const headers = { authorization: `Bearer ${(await minted.json()).token}` };
  return {
    get: (path: string) => request.get(`${api.baseURL}${path}`, { headers }),
    post: (path: string, data?: object) => request.post(`${api.baseURL}${path}`, { headers, data }),
    patch: (path: string, data: object) => request.patch(`${api.baseURL}${path}`, { headers, data }),
    delete: (path: string) => request.delete(`${api.baseURL}${path}`, { headers }),
  };
}
async function team(request: APIRequestContext) {
  const owner = await as(request, "owner");
  const response = await owner.post("/teams", { name: "Managed team", description: "Team details" });
  expect(response.status()).toBe(201);
  const created = await response.json();
  await database.pool.query("INSERT INTO team_members(team_id,user_id,role) VALUES ($1,'admin','admin'),($1,'another-admin','admin'),($1,'member','member')", [created.id]);
  return `/teams/${created.id}`;
}

test("Owner/Admin edit team details, Member cannot, and body fields cannot transfer ownership", async ({ request }) => {
  const path = await team(request);
  const owner = await as(request, "owner"), admin = await as(request, "admin");
  const updated = await admin.patch(path, { name: "  Renamed team  ", description: "  Updated  ", ownerUserId: "admin" });
  expect(updated.status()).toBe(200);
  expect(await updated.json()).toMatchObject({ name: "Renamed team", description: "Updated", ownerUserId: "owner", role: "admin" });
  expect((await (await as(request, "member")).patch(path, { name: "No" })).status()).toBe(403);
  expect((await (await as(request, "outsider")).patch(path, { name: "Hidden" })).status()).toBe(404);
  const invalid = await owner.patch(path, { name: " ", description: "x".repeat(10_001) });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).errors).toEqual(expect.objectContaining({ name: expect.any(Array), description: expect.any(Array) }));
  expect(await (await owner.get(path)).json()).toMatchObject({ name: "Renamed team" });
});

test("only the Owner appoints/demotes Admins and the Owner role cannot be changed", async ({ request }) => {
  const path = await team(request);
  const owner = await as(request, "owner");
  expect((await owner.patch(path + "/members/member", { role: "admin" })).status()).toBe(200);
  expect(await (await (await as(request, "member")).get(path)).json()).toMatchObject({ role: "admin" });
  expect((await owner.patch(path + "/members/member", { role: "member" })).status()).toBe(200);
  for (const sub of ["admin", "member"]) expect((await (await as(request, sub)).patch(path + "/members/member", { role: "admin" })).status()).toBe(403);
  expect((await owner.patch(path + "/members/owner", { role: "member" })).status()).toBe(409);
  expect((await owner.patch(path + "/members/member", { role: "owner" })).status()).toBe(400);
  expect((await owner.patch(path + "/members/missing", { role: "member" })).status()).toBe(404);
  expect((await (await as(request, "outsider")).patch(path + "/members/member", { role: "admin" })).status()).toBe(404);
});

test("Admins remove regular Members, Owner removes Admins, and voluntary leaving revokes team access", async ({ request }) => {
  const path = await team(request);
  const owner = await as(request, "owner"), admin = await as(request, "admin"), member = await as(request, "member");
  expect((await admin.delete(path + "/members/another-admin")).status()).toBe(403);
  expect((await member.delete(path + "/members/admin")).status()).toBe(403);
  expect((await owner.delete(path + "/members/owner")).status()).toBe(409);
  expect((await admin.delete(path + "/members/owner")).status()).toBe(409);
  expect((await admin.delete(path + "/members/member")).status()).toBe(204);
  expect((await owner.delete(path + "/members/another-admin")).status()).toBe(204);
  expect((await admin.delete(path + "/members/admin")).status()).toBe(204);
  expect((await admin.get(path)).status()).toBe(404);
  expect(await (await admin.get("/onboarding")).json()).toEqual({ completed: true });
  expect((await owner.post(path + "/members", { email: "outsider@example.invalid" })).status()).toBe(405);
});

test("ownership transfers to an existing regular Member, old Owner becomes Admin and can then leave", async ({ request }) => {
  const path = await team(request);
  const owner = await as(request, "owner"), member = await as(request, "member"), admin = await as(request, "admin");
  expect((await admin.post(path + "/ownership", { userId: "member" })).status()).toBe(403);
  expect((await owner.post(path + "/ownership", { userId: "outsider" })).status()).toBe(404);
  expect((await owner.post(path + "/ownership", { userId: "owner" })).status()).toBe(400);
  const transferred = await owner.post(path + "/ownership", { userId: "member" });
  expect(transferred.status()).toBe(200);
  expect(await transferred.json()).toMatchObject({ ownerUserId: "member", role: "admin" });
  expect(await (await member.get(path)).json()).toMatchObject({ ownerUserId: "member", role: "owner" });
  expect((await member.delete(path + "/members/member")).status()).toBe(409);
  expect((await owner.post(path + "/ownership", { userId: "admin" })).status()).toBe(403);
  expect((await owner.patch(path + "/members/admin", { role: "member" })).status()).toBe(403);
  expect((await owner.delete(path + "/members/owner")).status()).toBe(204);
  expect((await owner.get(path)).status()).toBe(404);
});

test("concurrent transfer/removal and promotion/removal preserve ownership and permission rules", async ({ request }) => {
  const owner = await as(request, "owner"), admin = await as(request, "admin");
  const path = await team(request);
  const [transfer, removal] = await Promise.all([
    owner.post(path + "/ownership", { userId: "member" }), admin.delete(path + "/members/member"),
  ]);
  expect([[200,409],[404,204]]).toContainEqual([transfer.status(), removal.status()]);
  const { rows } = await database.pool.query("SELECT t.owner_user_id,m.user_id FROM teams t LEFT JOIN team_members m ON m.team_id=t.id AND m.user_id=t.owner_user_id WHERE t.id=$1", [path.slice(7)]);
  expect(rows[0].user_id).toBe(rows[0].owner_user_id);
  const second = await team(request);
  const [promotion, removed] = await Promise.all([
    owner.patch(second + "/members/member", { role: "admin" }), admin.delete(second + "/members/member"),
  ]);
  expect([[200,403],[404,204]]).toContainEqual([promotion.status(), removed.status()]);
});
