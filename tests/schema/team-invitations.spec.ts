import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";
import { teamInvitationEmail } from "../../app/web/src/lib/email";
import { createAuth } from "../../app/web/src/lib/create-auth";
import type { EmailMessage } from "../../app/web/src/lib/email";

const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  test.setTimeout(180_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),('admin','Admin','admin@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),('recipient','Recipient','recipient@example.invalid',true,now(),now()),
    ('wrong','Wrong','wrong@example.invalid',true,now(),now()),('unverified','Unverified','unverified@example.invalid',false,now(),now());
    INSERT INTO user_onboarding(user_id,completed_at) VALUES ('owner',now()),('admin',now()),('member',now());`);
  const url = new URL(database.connectionString);
  api = await startApi(5109, { Auth__Issuer: issuer, ConnectionStrings__Database:
    `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}` });
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
  const created = await owner.post("/teams", { name: "Invitation team" });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await database.pool.query("INSERT INTO team_members(team_id,user_id,role) VALUES ($1,'admin','admin'),($1,'member','member')", [id]);
  return `/teams/${id}`;
}
async function issue(request: APIRequestContext, path: string, email = "recipient@example.invalid", role = "member", issuerId = "owner") {
  const response = await (await as(request, issuerId)).post(path + "/invitations", { email, role });
  expect(response.status()).toBe(201);
  return await response.json() as { token: string; teamName: string; invitation: { id: string; email: string; issuedAt: string; expiresAt: string; status: string } };
}
async function preview(request: APIRequestContext, token: string) { return request.get(`${api.baseURL}/invites/${token}`); }

test("creation sends no membership, stores only a hash, normalizes email and validates role/current manager permissions", async ({ request }) => {
  const path = await team(request);
  const owner = await as(request, "owner"), admin = await as(request, "admin");
  const issued = await issue(request, path, "  Recipient@Example.invalid  ");
  expect(issued.invitation.email).toBe("recipient@example.invalid");
  expect(Date.parse(issued.invitation.expiresAt) - Date.parse(issued.invitation.issuedAt)).toBe(7 * 86_400_000);
  expect(issued.token).toMatch(/^[a-f0-9]{64}$/);
  const stored = (await database.pool.query("SELECT token_hash FROM team_invitations WHERE id=$1", [issued.invitation.id])).rows[0];
  expect(stored.token_hash).toBe(createHash("sha256").update(issued.token).digest("hex"));
  expect(stored.token_hash).not.toBe(issued.token);
  expect((await database.pool.query("SELECT user_id FROM team_members WHERE team_id=$1 AND user_id='recipient'", [path.slice(7)])).rows).toEqual([]);
  expect((await owner.post(path + "/invitations", { email: issued.invitation.email, role: "member" })).status()).toBe(409);
  expect((await owner.post(path + "/invitations", { email: "member@example.invalid", role: "member" })).status()).toBe(409);
  const invalid = await owner.post(path + "/invitations", { email: "Person <person@example.invalid>", role: "owner" });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).errors).toMatchObject({ email: expect.any(Array), role: expect.any(Array) });
  expect((await admin.post(path + "/invitations", { email: "another@example.invalid", role: "admin" })).status()).toBe(403);
  await issue(request, path, "another@example.invalid", "member", "admin");
  for (const sub of ["member", "wrong"]) {
    const caller = await as(request, sub), expected = sub === "member" ? 403 : 404;
    expect((await caller.get(path + "/invitations")).status()).toBe(expected);
    expect((await caller.post(path + "/invitations", { email: "somebody@example.invalid", role: "member" })).status()).toBe(expected);
  }
  const listed = await (await owner.get(path + "/invitations")).json();
  expect(listed).toHaveLength(2);
  expect(JSON.stringify(listed)).not.toContain(issued.token);
  expect(JSON.stringify(listed)).not.toContain(stored.token_hash);
});

test("public preview grants no access; verified matching acceptance atomically joins, completes onboarding and cannot rejoin after removal", async ({ request }) => {
  const path = await team(request), issued = await issue(request, path, "recipient@example.invalid", "admin");
  const recipient = await as(request, "recipient");
  await database.pool.query("DELETE FROM user_onboarding WHERE user_id='recipient'");
  const publicPreview = await preview(request, issued.token.toUpperCase());
  expect(publicPreview.status()).toBe(200);
  expect(publicPreview.headers()["cache-control"]).toBe("no-store");
  expect(await publicPreview.json()).toMatchObject({ teamName: "Invitation team", email: "recipient@example.invalid", role: "admin", status: "pending" });
  expect((await recipient.get(path)).status()).toBe(404);
  expect((await request.post(`${api.baseURL}/invites/${issued.token}/accept`)).status()).toBe(401);
  expect((await (await as(request, "wrong")).post(`/invites/${issued.token}/accept`)).status()).toBe(403);
  expect((await (await as(request, "no-account")).post(`/invites/${issued.token}/accept`)).status()).toBe(403);
  const unverified = await issue(request, path, "unverified@example.invalid");
  expect((await (await as(request, "unverified")).post(`/invites/${unverified.token}/accept`)).status()).toBe(403);
  expect((await database.pool.query("SELECT user_id FROM user_onboarding WHERE user_id IN ('recipient','wrong','unverified')")).rows).toEqual([]);
  const accepted = await recipient.post(`/invites/${issued.token}/accept`);
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toMatchObject({ id: path.slice(7), role: "admin" });
  expect(await (await recipient.get("/onboarding")).json()).toEqual({ completed: true });
  expect((await recipient.post(`/invites/${issued.token}/accept`)).status()).toBe(200);
  expect((await (await preview(request, issued.token)).json()).status).toBe("accepted");
  const owner = await as(request, "owner");
  expect((await owner.delete(path + "/members/recipient")).status()).toBe(204);
  expect((await recipient.post(`/invites/${issued.token}/accept`)).status()).toBe(409);
  expect((await recipient.get(path)).status()).toBe(404);
  expect(await (await recipient.get("/onboarding")).json()).toEqual({ completed: true });
});

test("resend rotates links and refreshes seven-day expiry; revoke and expiry block acceptance", async ({ request }) => {
  const path = await team(request), issued = await issue(request, path);
  const owner = await as(request, "owner"), recipient = await as(request, "recipient");
  await database.pool.query("UPDATE team_invitations SET issued_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1", [issued.invitation.id]);
  expect((await (await preview(request, issued.token)).json()).status).toBe("expired");
  expect((await recipient.post(`/invites/${issued.token}/accept`)).status()).toBe(410);
  const fresh = await (await owner.post(`${path}/invitations/${issued.invitation.id}/resend`)).json();
  expect(fresh.token).not.toBe(issued.token);
  expect((await preview(request, issued.token)).status()).toBe(404);
  expect(Date.parse(fresh.invitation.expiresAt) - Date.parse(fresh.invitation.issuedAt)).toBe(7 * 86_400_000);
  expect((await owner.delete(`${path}/invitations/${issued.invitation.id}`)).status()).toBe(204);
  expect((await owner.delete(`${path}/invitations/${issued.invitation.id}`)).status()).toBe(204);
  expect((await (await preview(request, fresh.token)).json()).status).toBe("revoked");
  expect((await recipient.post(`/invites/${fresh.token}/accept`)).status()).toBe(410);
  expect((await owner.post(`${path}/invitations/${issued.invitation.id}/resend`)).status()).toBe(409);
  await issue(request, path); // A revoked invitation does not reserve the recipient forever.
});

test("loss of inviter permission blocks acceptance; permitted resend renews the issuer; Admins cannot manage Admin invitations", async ({ request }) => {
  const path = await team(request), issued = await issue(request, path, "recipient@example.invalid", "member", "admin");
  const owner = await as(request, "owner"), admin = await as(request, "admin"), recipient = await as(request, "recipient");
  expect((await owner.patch(path + "/members/admin", { role: "member" })).status()).toBe(200);
  expect((await (await preview(request, issued.token)).json()).status).toBe("unavailable");
  expect((await recipient.post(`/invites/${issued.token}/accept`)).status()).toBe(410);
  const fresh = await (await owner.post(`${path}/invitations/${issued.invitation.id}/resend`)).json();
  expect(fresh.invitation.inviterName).toBe("Owner");
  expect((await recipient.post(`/invites/${fresh.token}/accept`)).status()).toBe(200);
  expect((await owner.patch(path + "/members/admin", { role: "admin" })).status()).toBe(200);
  const adminInvite = await issue(request, path, "new-admin@example.invalid", "admin");
  expect((await admin.post(`${path}/invitations/${adminInvite.invitation.id}/resend`)).status()).toBe(403);
  expect((await admin.delete(`${path}/invitations/${adminInvite.invitation.id}`)).status()).toBe(403);
  expect((await owner.post(path + "/ownership", { userId: "member" })).status()).toBe(200);
  expect((await (await preview(request, adminInvite.token)).json()).status).toBe("unavailable");
  const newOwner = await as(request, "member");
  expect((await newOwner.post(`${path}/invitations/${adminInvite.invitation.id}/resend`)).status()).toBe(200);
});

test("concurrent accepts and revocation preserve one membership and one completion; accepted invitations cannot be resent", async ({ request }) => {
  const first = await team(request), second = await team(request);
  const one = await issue(request, first), two = await issue(request, second);
  await database.pool.query("DELETE FROM user_onboarding WHERE user_id='recipient'");
  const recipient = await as(request, "recipient"), owner = await as(request, "owner");
  const accepted = await Promise.all([recipient.post(`/invites/${one.token}/accept`), recipient.post(`/invites/${one.token}/accept`), recipient.post(`/invites/${two.token}/accept`)]);
  expect(accepted.map(response => response.status())).toEqual([200, 200, 200]);
  expect((await database.pool.query("SELECT count(*)::int AS count FROM user_onboarding WHERE user_id='recipient'")).rows[0].count).toBe(1);
  expect((await database.pool.query("SELECT count(*)::int AS count FROM team_members WHERE user_id='recipient' AND team_id IN ($1,$2)", [first.slice(7), second.slice(7)])).rows[0].count).toBe(2);
  expect((await owner.post(`${first}/invitations/${one.invitation.id}/resend`)).status()).toBe(409);
  expect((await owner.delete(`${first}/invitations/${one.invitation.id}`)).status()).toBe(409);
  const third = await team(request), race = await issue(request, third);
  const [accept, revoke] = await Promise.all([recipient.post(`/invites/${race.token}/accept`), owner.delete(`${third}/invitations/${race.invitation.id}`)]);
  expect([[200,409],[410,204]]).toContainEqual([accept.status(), revoke.status()]);
  const row = (await database.pool.query("SELECT accepted_at,revoked_at FROM team_invitations WHERE id=$1", [race.invitation.id])).rows[0];
  expect(Boolean(row.accepted_at)).toBe(accept.status() === 200);
  expect(Boolean(row.revoked_at)).toBe(revoke.status() === 204);
});

test("invalid/replaced tokens stay unavailable and cross-team invitation IDs cannot be managed", async ({ request }) => {
  const first = await team(request), second = await team(request), issued = await issue(request, first);
  const owner = await as(request, "owner"), recipient = await as(request, "recipient");
  for (const token of ["x", "0".repeat(64), "a".repeat(63), "z".repeat(64)]) {
    expect((await preview(request, token)).status()).toBe(404);
    expect((await recipient.post(`/invites/${token}/accept`)).status()).toBe(404);
  }
  expect((await owner.delete(`${second}/invitations/${issued.invitation.id}`)).status()).toBe(404);
  expect((await owner.post(`${second}/invitations/${issued.invitation.id}/resend`)).status()).toBe(404);
});

test("real signup and verification preserve the invitation destination; accepting completes setup with only the invited team", async ({ request }) => {
  const path = await team(request), issued = await issue(request, path, "new-signup@example.invalid");
  const messages: EmailMessage[] = [];
  const baseURL = "http://localhost:3000";
  const web = createAuth({ BETTER_AUTH_SECRET: "invitation-test-secret-at-least-32-characters", BETTER_AUTH_URL: baseURL,
    DATABASE_URL: database.connectionString, EMAIL_DELIVERY: "log" }, { sendEmail: async message => { messages.push(message); } });
  const call = (endpoint: string, body?: object) => web.auth.handler(new Request(endpoint.startsWith("http") ? endpoint : `${baseURL}/api/auth${endpoint}`, {
    method: body ? "POST" : "GET", headers: { "content-type": "application/json", origin: baseURL }, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  try {
    const signup = await call("/sign-up/email", { name: "New invited user", email: "new-signup@example.invalid", password: "invited secure passphrase", callbackURL: `/invites/${issued.token}` });
    expect(signup.status).toBe(200);
    expect(messages).toHaveLength(1);
    const { rows: [account] } = await database.pool.query('SELECT id,"emailVerified" FROM "user" WHERE email=$1', ["new-signup@example.invalid"]);
    expect(account.emailVerified).toBe(false);
    const caller = await as(request, account.id);
    expect((await caller.post(`/invites/${issued.token}/accept`)).status()).toBe(403);
    const verify = await call(messages[0].text.match(/https?:\/\/\S+/)![0]);
    expect(verify.status).toBe(302);
    expect(new URL(verify.headers.get("location")!, baseURL).pathname).toBe(`/invites/${issued.token}`);
    expect(verify.headers.getSetCookie().some(cookie => cookie.startsWith("better-auth.session_token="))).toBe(true);
    expect(await (await caller.get("/onboarding")).json()).toEqual({ completed: false });
    expect((await caller.post(`/invites/${issued.token}/accept`)).status()).toBe(200);
    expect(await (await caller.get("/onboarding")).json()).toEqual({ completed: true });
    expect((await (await caller.get("/teams")).json()).map((team: { id: string }) => team.id)).toEqual([path.slice(7)]);
    expect((await database.pool.query("SELECT id FROM teams WHERE owner_user_id=$1", [account.id])).rows).toEqual([]);
  } finally { await web.pool.end(); }
});

test("invitation schema denies browser roles; rollback removes only invitation storage and reapply restores guards", async ({ request }) => {
  const path = await team(request), issued = await issue(request, path);
  expect((await (await as(request, "recipient")).post(`/invites/${issued.token}/accept`)).status()).toBe(200);
  const security = (await database.pool.query(`SELECT c.relrowsecurity AS rls,
    has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated
    FROM pg_class c WHERE c.oid='public.team_invitations'::regclass`)).rows[0];
  expect(security).toEqual({ rls: true, anon: false, authenticated: false });
  await database.pool.query((await readFile("docs/schema/team-invitations-rollback.sql", "utf8")).replace(/^\uFEFF/, ""));
  expect((await database.pool.query("SELECT count(*)::int AS count FROM team_members WHERE team_id=$1 AND user_id='recipient'", [path.slice(7)])).rows[0].count).toBe(1);
  expect((await database.pool.query("SELECT count(*)::int AS count FROM user_onboarding WHERE user_id='recipient'")).rows[0].count).toBe(1);
  await database.pool.query((await readFile("docs/schema/team-invitations.sql", "utf8")).replace(/^\uFEFF/, ""));
  expect((await database.pool.query("SELECT count(*)::int AS count FROM team_invitations")).rows[0].count).toBe(0);
});

test("invitation mail includes the join link and escapes team/inviter content", () => {
  const message = teamInvitationEmail({ to: "recipient@example.invalid", url: `https://specthread.example/invites/${"a".repeat(64)}`,
    teamName: '<img src=x onerror="alert(1)">', inviterName: "<script>bad</script>", role: "admin", expiresAt: "2026-10-15T12:00:00Z" });
  expect(message.text).toContain("as an Admin");
  expect(message.text).toContain("Review invitation: https://specthread.example/invites/");
  expect(message.html).not.toContain("<img");
  expect(message.html).not.toContain("<script>");
  expect(message.html).toContain("&#60;script&#62;");
});
