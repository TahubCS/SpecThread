import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// The project export (ADR-068, US-22), called directly against a disposable PostgreSQL database.
const issuer = "http://127.0.0.1:5101";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Danielle Lead','owner@example.invalid',true,now(),now()),
    ('reviewer','Robert Client','reviewer@example.invalid',true,now(),now()),
    ('observer','Angela Instructor','observer@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  api = await startApi(5138, {
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

test("an export lists active requirements with criteria, evidence status, and the latest decision with reviewer name and date", async ({ request }) => {
  const owner = await as(request, "owner");
  const reviewer = await as(request, "reviewer");
  const team = await (await owner.post("/teams", { name: "Export team" })).json();
  await database.pool.query(`INSERT INTO public.team_members (team_id,user_id,role) VALUES ($1,'reviewer','reviewer'),($1,'observer','observer')`, [team.id]);
  const project = await (await owner.post("/projects", { name: "Checkout", teamId: team.id })).json();
  const create = async (title: string, acceptanceCriteria: string[], milestone?: string) =>
    (await (await owner.post(`/projects/${project.id}/requirements`, { title, acceptanceCriteria, milestone })).json()) as { id: string };
  const pay = await create("Guest pays", ["Pay without an account", "Receipt is emailed"], "Sprint 1");
  const ship = await create("Order ships", ["Label prints"], "Sprint 2");
  const gone = await create("Gone", ["x"], "Sprint 1");
  await owner.post(`/requirements/${gone.id}/archive`);

  // Robert asks for more evidence on "Guest pays", then accepts it; "Order ships" is accepted and then edited.
  expect((await reviewer.post(`/requirements/${pay.id}/reviews`, { decision: "more_evidence", note: "Link the release.", version: 1 })).status()).toBe(201);
  expect((await reviewer.post(`/requirements/${pay.id}/reviews`, { decision: "accepted", note: "Looks right.", version: 1 })).status()).toBe(201);
  expect((await reviewer.post(`/requirements/${ship.id}/reviews`, { decision: "accepted", note: "", version: 1 })).status()).toBe(201);
  expect((await owner.put(`/requirements/${ship.id}`, { title: "Order ships", acceptanceCriteria: ["Label prints", "Tracking emailed"], documentIds: [], version: 1, confirmCriteriaChange: true })).status()).toBe(200);

  const response = await (await as(request, "observer")).get(`/projects/${project.id}/export`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ projectId: project.id, projectName: "Checkout", milestone: null });
  expect(Date.parse(body.generatedAt)).toBeGreaterThan(Date.now() - 60_000);
  expect(body.requirements).toEqual([
    { id: pay.id, title: "Guest pays", milestone: "Sprint 1", criteriaVersion: 1, acceptanceCriteria: ["Pay without an account", "Receipt is emailed"],
      evidenceComplete: false, evidenceMissing: ["issue", "merged_pull_request", "passing_checks", "release"],
      latestDecision: { decision: "accepted", note: "Looks right.", reviewerName: "Robert Client", decidedAt: expect.any(String), outdated: false, criteriaChanged: false } },
    { id: ship.id, title: "Order ships", milestone: "Sprint 2", criteriaVersion: 2, acceptanceCriteria: ["Label prints", "Tracking emailed"],
      evidenceComplete: false, evidenceMissing: ["issue", "merged_pull_request", "passing_checks", "release"],
      latestDecision: { decision: "accepted", note: "", reviewerName: "Robert Client", decidedAt: expect.any(String), outdated: true, criteriaChanged: true } },
  ]);

  // One milestone only; an unknown one is empty; the label is trimmed.
  const sprint = await (await owner.get(`/projects/${project.id}/export?milestone=${encodeURIComponent(" Sprint 2 ")}`)).json();
  expect(sprint.milestone).toBe("Sprint 2");
  expect(sprint.requirements.map((r: { title: string }) => r.title)).toEqual(["Order ships"]);
  expect((await (await owner.get(`/projects/${project.id}/export?milestone=Sprint%209`)).json()).requirements).toEqual([]);

  expect((await (await as(request, "outsider")).get(`/projects/${project.id}/export`)).status()).toBe(404);
  expect((await owner.get(`/projects/${crypto.randomUUID()}/export`)).status()).toBe(404);
});
