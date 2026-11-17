import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// Reviewer and Observer team roles (ADR-058), called directly against a disposable PostgreSQL
// database. Evidence links are inserted as rows, so GitHub is not involved: every refused write
// is refused before the API would read GitHub.
const issuer = "http://127.0.0.1:5101";
const pdf = Buffer.from("%PDF-1.4\n% SpecThread test document\n");
const readOnly = "Your role on this team can read this project but not change it.";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let nextNumber = 1;

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
    ('client','Client','client@example.invalid',true,now(),now()),
    ('instructor','Instructor','instructor@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  api = await startApi(5133, {
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
    upload: (projectId: string) => request.post(url(`/projects/${projectId}/documents`), {
      headers, multipart: { file: { name: "spec.pdf", mimeType: "application/pdf", buffer: pdf } },
    }),
  };
}

/** A team owned by "owner" with one user in each other role, a project, two requirements, a linked issue, and a document. */
async function setUp(request: APIRequestContext) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name: "Contract team" })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query(`INSERT INTO public.team_members (team_id,user_id,role) VALUES
    ($1,'admin','admin'),($1,'member','member'),($1,'reviewer','reviewer'),($1,'observer','observer')`, [team.id]);
  const project = await (await owner.post("/projects", { name: "Checkout", teamId: team.id })).json();
  const member = await as(request, "member");
  const first = await (await member.post(`/projects/${project.id}/requirements`, { title: "Guest checkout", acceptanceCriteria: ["Done"] })).json();
  const second = await (await member.post(`/projects/${project.id}/requirements`, { title: "Saved carts", acceptanceCriteria: ["Done"] })).json();
  const { rows: [evidence] } = await database.pool.query(`INSERT INTO public.requirement_evidence
    (requirement_id,kind,repository_id,repository_owner,repository_name,number,title,state,url,github_created_at,github_updated_at,linked_by)
    VALUES ($1,'issue',1,'acme','web',$2,'Guests cannot pay','open','https://github.com/acme/web/issues/1',now(),now(),'member') RETURNING id`,
  [first.id, nextNumber++]);
  const document = await (await member.upload(project.id)).json();
  return {
    teamPath: `/teams/${team.id}`, projectId: project.id as string, requirementId: first.id as string,
    otherId: second.id as string, evidenceId: evidence.id as string, documentId: document.id as string,
  };
}

test("Reviewers and Observers read the team's projects, requirements, evidence, documents, and decisions", async ({ request }) => {
  const { teamPath, projectId, requirementId, documentId } = await setUp(request);
  for (const sub of ["reviewer", "observer"]) {
    const caller = await as(request, sub);
    expect(await (await caller.get(teamPath)).json()).toMatchObject({ role: sub });
    expect((await (await caller.get("/projects")).json()).map((p: { id: string }) => p.id)).toContain(projectId);
    expect(await (await caller.get(`/projects/${projectId}`)).json()).toMatchObject({ teamRole: sub });
    expect((await (await caller.get(`/projects/${projectId}/requirements`)).json())).toHaveLength(2);
    for (const path of [`/requirements/${requirementId}`, `/requirements/${requirementId}/evidence`, `/requirements/${requirementId}/reviews`,
      `/requirements/${requirementId}/follow-ups`, `/requirements/${requirementId}/evidence/history`, `/documents/${documentId}`,
      `/documents/${documentId}/content`, `/projects/${projectId}/documents`, `/projects/${projectId}/members`]) {
      expect((await caller.get(path)).status(), `${sub} ${path}`).toBe(200);
    }
    expect((await (await caller.get(`/requirements/${requirementId}/evidence`)).json())).toHaveLength(1);
  }
});

test("Reviewers and Observers cannot create, edit, archive, or restore requirements, or change links or documents", async ({ request }) => {
  const { projectId, requirementId, otherId, evidenceId, documentId } = await setUp(request);
  const requirement = `/requirements/${requirementId}`;
  for (const sub of ["reviewer", "observer"]) {
    const caller = await as(request, sub);
    const attempts: [string, () => ReturnType<typeof caller.get>][] = [
      ["create", () => caller.post(`/projects/${projectId}/requirements`, { title: "Sneaky", acceptanceCriteria: ["Done"] })],
      ["edit", () => caller.put(requirement, { title: "Changed", acceptanceCriteria: ["Done"], version: 1 })],
      ["archive", () => caller.post(`${requirement}/archive`)],
      ["restore", () => caller.post(`${requirement}/restore`)],
      ["milestone", () => caller.put(`${requirement}/milestone`, { milestone: "Sprint 9" })],
      ["follow-up", () => caller.post(`${requirement}/follow-ups`, { originalRequirementId: otherId })],
      ["unfollow", () => caller.delete(`${requirement}/follow-ups/${otherId}`)],
      ["link", () => caller.post(`${requirement}/evidence`, { reference: "#4" })],
      ["refresh", () => caller.post(`${requirement}/evidence/refresh`)],
      ["unlink", () => caller.delete(`${requirement}/evidence/${evidenceId}`)],
      ["move", () => caller.post(`${requirement}/evidence/${evidenceId}/move`, { targetRequirementId: otherId })],
      ["scan", () => caller.post(`${requirement}/evidence/suggestions/scan`)],
      ["confirm", () => caller.post(`${requirement}/evidence/suggestions/00000000-0000-4000-8000-000000000000/confirm`)],
      ["reject", () => caller.post(`${requirement}/evidence/suggestions/00000000-0000-4000-8000-000000000000/reject`)],
      ["upload", () => caller.upload(projectId)],
      ["archive document", () => caller.post(`/documents/${documentId}/archive`)],
    ];
    for (const [name, attempt] of attempts) {
      const response = await attempt();
      expect(response.status(), `${sub} ${name}`).toBe(403);
      expect((await response.json()).detail, `${sub} ${name}`).toBe(readOnly);
    }
  }
  // Nothing changed.
  const member = await as(request, "member");
  expect(await (await member.get(requirement)).json()).toMatchObject({ title: "Guest checkout", version: 1, archivedAt: null, milestone: null });
  expect(await (await member.get(`${requirement}/evidence`)).json()).toHaveLength(1);
  expect(await (await member.get(`/projects/${projectId}/requirements`)).json()).toHaveLength(2);
  expect(await (await member.get(`/projects/${projectId}/documents`)).json()).toHaveLength(1);
  expect(await (await member.get(`${requirement}/follow-ups`)).json()).toMatchObject({ followUpOf: [], followedUpBy: [] });
});

test("a Reviewer records decisions; an Observer cannot; the author decides on their own requirement", async ({ request }) => {
  const { requirementId } = await setUp(request);
  const path = `/requirements/${requirementId}/reviews`;
  const refused = await (await as(request, "observer")).post(path, { decision: "accepted", version: 1 });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).detail).toBe("Observers can read decisions but not record them.");

  const reviewed = await (await as(request, "reviewer")).post(path, { decision: "more_evidence", note: "Show a test run.", version: 1 });
  expect(reviewed.status()).toBe(201);
  expect(await reviewed.json()).toMatchObject({ decision: "more_evidence", decidedBy: "reviewer" });

  // "member" wrote the requirement and may approve or deny it.
  const own = await (await as(request, "member")).post(path, { decision: "accepted", version: 1 });
  expect(own.status()).toBe(201);
  expect(await own.json()).toMatchObject({ decision: "accepted", decidedBy: "member" });
  const denied = await (await as(request, "member")).post(path, { decision: "rejected", note: "Scope changed.", version: 1 });
  expect(denied.status()).toBe(201);

  expect((await (await (await as(request, "observer")).get(path)).json()).map((r: { decidedBy: string }) => r.decidedBy))
    .toEqual(["member", "member", "reviewer"]);
});

test("Reviewer and Observer are invited, assigned, and removed like Members", async ({ request }) => {
  const { teamPath, projectId } = await setUp(request);
  const owner = await as(request, "owner"), admin = await as(request, "admin");

  // The Owner and Admins both invite Reviewers and Observers; the role arrives with acceptance.
  for (const [inviter, email, role, sub] of [[owner, "client@example.invalid", "reviewer", "client"], [admin, "instructor@example.invalid", "observer", "instructor"]] as const) {
    const issued = await inviter.post(`${teamPath}/invitations`, { email, role });
    expect(issued.status()).toBe(201);
    const { token, invitation } = await issued.json();
    expect(invitation).toMatchObject({ role, status: "pending" });
    expect(await (await request.get(`${api.baseURL}/invites/${token}`)).json()).toMatchObject({ role });
    const accepted = await (await as(request, sub)).post(`/invites/${token}/accept`);
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toMatchObject({ role });
    expect(await (await (await as(request, sub)).get(`/projects/${projectId}`)).json()).toMatchObject({ teamRole: role });
  }
  const invalid = await owner.post(`${teamPath}/invitations`, { email: "someone@example.invalid", role: "owner" });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).errors.role).toEqual(["Choose Admin, Member, Reviewer, or Observer."]);
  // Reviewers and Observers do not manage the team.
  for (const sub of ["reviewer", "observer"]) {
    expect((await (await as(request, sub)).post(`${teamPath}/invitations`, { email: "x@example.invalid", role: "observer" })).status()).toBe(403);
    expect((await (await as(request, sub)).post("/projects", { name: "Nope", teamId: teamPath.slice(7) })).status()).toBe(403);
  }

  // The Owner changes roles; a former Reviewer made a Member can edit, and back again cannot.
  expect((await owner.patch(`${teamPath}/members/reviewer`, { role: "member" })).status()).toBe(200);
  const promoted = await (await as(request, "reviewer")).post(`/projects/${projectId}/requirements`, { title: "Now allowed", acceptanceCriteria: ["Done"] });
  expect(promoted.status()).toBe(201);
  const demoted = await owner.patch(`${teamPath}/members/reviewer`, { role: "observer" });
  expect(await demoted.json()).toMatchObject({ role: "observer" });
  expect((await (await as(request, "reviewer")).post(`/projects/${projectId}/requirements`, { title: "No longer", acceptanceCriteria: ["Done"] })).status()).toBe(403);
  expect((await admin.patch(`${teamPath}/members/observer`, { role: "member" })).status()).toBe(403);

  const members = await (await owner.get(`${teamPath}/members`)).json();
  expect(members.find((m: { userId: string }) => m.userId === "client")).toMatchObject({ role: "reviewer" });
  // Admins remove Reviewers and Observers.
  expect((await admin.delete(`${teamPath}/members/client`)).status()).toBe(204);
  expect((await admin.delete(`${teamPath}/members/instructor`)).status()).toBe(204);
  expect((await (await as(request, "client")).get(`/projects/${projectId}`)).status()).toBe(404);
});

test("the schema accepts the new roles; rollback removes their memberships and invitations and reapplying restores them", async ({ request }) => {
  const { teamPath } = await setUp(request);
  const teamId = teamPath.slice(7);
  const count = async (sql: string) => (await database.pool.query(sql, [teamId])).rows[0].count as number;
  await expect(database.pool.query("UPDATE public.team_members SET role = 'owner' WHERE team_id = $1 AND user_id = 'member'", [teamId]))
    .rejects.toThrow(/check constraint/);
  await (await as(request, "owner")).post(`${teamPath}/invitations`, { email: "nobody-yet@example.invalid", role: "observer" });

  await database.pool.query(await readFile("docs/schema/team-reviewer-observer-roles-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM public.team_members WHERE team_id = $1 AND role IN ('reviewer','observer')")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.team_invitations WHERE team_id = $1 AND role = 'observer'")).toBe(0);
  // Everyone else keeps their place.
  expect(await count("SELECT count(*)::int AS count FROM public.team_members WHERE team_id = $1")).toBe(3);
  await expect(database.pool.query("UPDATE public.team_members SET role = 'reviewer' WHERE team_id = $1 AND user_id = 'member'", [teamId]))
    .rejects.toThrow(/check constraint/);

  await database.pool.query(await readFile("docs/schema/team-reviewer-observer-roles.sql", "utf8"));
  await database.pool.query("UPDATE public.team_members SET role = 'reviewer' WHERE team_id = $1 AND user_id = 'member'", [teamId]);
});
