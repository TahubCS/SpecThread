import { expect, test, type APIRequestContext } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startFakeGitHub } from "../../scripts/test-github.mjs";
import { startApi } from "../support/api-process";

// Releases recorded as deployed to an environment (ADR-066, US-13), called directly against a
// disposable PostgreSQL database and a local stand-in for GitHub.
const issuer = "http://127.0.0.1:5101";
const gitHub = "http://127.0.0.1:5137";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let fake: Server;
let nextId = 3000;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('reviewer','Reviewer','reviewer@example.invalid',true,now(),now()),
    ('observer','Observer','observer@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  fake = await startFakeGitHub({ port: 5137, appId: "889", publicKey: key.publicKey });
  api = await startApi(5136, {
    ConnectionStrings__Database: `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`,
    Auth__Issuer: issuer, GitHub__ApiBaseUrl: gitHub, GitHub__AppId: "889",
    GitHub__PrivateKey: String(key.privateKey.export({ type: "pkcs1", format: "pem" })),
  });
});
test.afterAll(async () => {
  api?.stop();
  await new Promise(resolve => fake ? fake.close(resolve) : resolve(undefined));
  await database?.stop();
});

async function as(request: APIRequestContext, sub: string) {
  const minted = await request.post(`${issuer}/sign`, { data: { claims: { sub } } });
  const headers = { authorization: `Bearer ${(await minted.json()).token}` };
  const url = (path: string) => `${api.baseURL}${path}`;
  return {
    get: (path: string) => request.get(url(path), { headers }),
    post: (path: string, data?: object) => request.post(url(path), { headers, data }),
  };
}

const sha = (start: string) => start.padEnd(40, "0");
const [merged, branch, early, late, unknown] = [sha("5ca1ab1e"), sha("abc1234"), sha("0a1b2c3d"), sha("feed123"), sha("dead999")];

/**
 * A project with two requirements and a connected repository: "Checkout" links a merged pull
 * request and a commit, "Search" links a later commit, and "Docs" links only an issue.
 */
async function setUp(request: APIRequestContext) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name: "Release team" })).json();
  await database.pool.query(`INSERT INTO public.team_members (team_id,user_id,role) VALUES
    ($1,'member','member'),($1,'reviewer','reviewer'),($1,'observer','observer')`, [team.id]);
  const project = await (await owner.post("/projects", { name: "Shop", teamId: team.id })).json();
  const [installationId, repositoryId] = [nextId++, nextId++];
  await request.put(`${gitHub}/__github/users/seed-${installationId}`, { data: { installations: [{ id: installationId, repositories: [{ id: repositoryId, owner: "acme", name: "web" }] }] } });
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/items`, { data: { items: [
    { number: 3, title: "Docs are thin", state: "open", user: "ada", created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" },
    { number: 9, pull: true, merged: true, merge_sha: merged, title: "Add guest checkout", state: "closed", user: "grace", created_at: "2026-09-05T10:00:00Z",
      updated_at: "2026-09-06T10:00:00Z", closed_at: "2026-09-06T10:00:00Z", commits: [{ sha: branch, message: "Add guest path", date: "2026-09-05T09:00:00Z" }] },
  ] } });
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/commits`, { data: { commits: [early, late, unknown].map(value => ({ sha: value, message: `Commit ${value.slice(0, 4)}`, date: "2026-09-20T09:00:00Z" })) } });
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/releases`, { data: { releases: [
    { tag: "v1.2", name: "Spring release", published_at: "2026-09-25T10:00:00Z", author: "ada", sha: sha("1111111"), contains: [merged, early], unknown: [unknown] },
    { tag: "v2.0", prerelease: true, published_at: "2026-10-05T10:00:00Z", sha: sha("2222222"), contains: [merged, early, late], author: null },
  ] } });
  await database.pool.query(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
    VALUES ($1,$2,$3,'acme','web',false,'owner')`, [project.id, installationId, repositoryId]);
  const member = await as(request, "member");
  const requirement = async (title: string, references: string[]) => {
    const created = await (await member.post(`/projects/${project.id}/requirements`, { title, acceptanceCriteria: ["Done"] })).json();
    for (const reference of references) expect((await member.post(`/requirements/${created.id}/evidence`, { reference })).status(), reference).toBe(201);
    return created.id as string;
  };
  const checkout = await requirement("Checkout", ["9", early, unknown]);
  const search = await requirement("Search", [late]);
  const docs = await requirement("Docs", ["3"]);
  return { projectId: project.id as string, teamId: team.id as string, repositoryId, checkout, search, docs };
}

test("a release records its tag, environment, date, and who added it, and lists the requirements its history includes", async ({ request }) => {
  const { projectId, checkout } = await setUp(request);
  const member = await as(request, "member");
  const recorded = await member.post(`/projects/${projectId}/releases`, { tag: " v1.2 ", environment: " Production ", deployedOn: "2026-09-26" });
  expect(recorded.status()).toBe(201);
  const release = await recorded.json();
  expect(release).toMatchObject({
    tag: "v1.2", name: "Spring release", url: "https://github.com/acme/repo/releases/tag/v1.2", sha: sha("1111111"), author: "ada",
    prerelease: false, publishedAt: "2026-09-25T10:00:00Z", environment: "Production", deployedOn: "2026-09-26", recordedBy: "member",
    projectId, compared: 4,
  });
  expect(Date.parse(release.recordedAt)).toBeGreaterThan(Date.now() - 60_000);
  expect(release.comparedAt).toBe(release.recordedAt);
  // The merged pull request is compared by its merge commit; an issue never is; a commit GitHub no longer has is in no release.
  expect(release.requirements).toEqual([
    { id: checkout, title: "Checkout", archivedAt: null, changes: [
      { evidenceId: expect.any(String), kind: "pull_request", label: "#9", title: "Add guest checkout" },
      { evidenceId: expect.any(String), kind: "commit", label: early.slice(0, 7), title: `Commit ${early.slice(0, 4)}` },
    ] },
  ]);

  // The same release reaches another environment as a separate record, and the list is newest deployment first.
  const staging = await (await member.post(`/projects/${projectId}/releases`, { tag: "v2.0", environment: "Staging", deployedOn: "2026-10-06" })).json();
  expect(staging).toMatchObject({ prerelease: true, author: null, name: "v2.0", requirements: [{ title: "Checkout" }, { title: "Search" }] });
  const list = await (await (await as(request, "observer")).get(`/projects/${projectId}/releases`)).json();
  expect(list.map((entry: { tag: string; environment: string }) => `${entry.tag} ${entry.environment}`)).toEqual(["v2.0 Staging", "v1.2 Production"]);
  expect(await (await (await as(request, "reviewer")).get(`/releases/${release.id}`)).json()).toEqual(release);
  expect((await (await as(request, "outsider")).get(`/releases/${release.id}`)).status()).toBe(404);
  expect((await (await as(request, "outsider")).get(`/projects/${projectId}/releases`)).status()).toBe(404);
});

test("recording is validated, refused for read-only roles and duplicates, and explains what GitHub can't find", async ({ request }) => {
  const { projectId, repositoryId } = await setUp(request);
  const member = await as(request, "member");
  const path = `/projects/${projectId}/releases`;
  const valid = { tag: "v1.2", environment: "Production", deployedOn: "2026-09-26" };
  for (const [body, field, message] of [
    [{ ...valid, tag: " " }, "tag", "Enter a value."],
    [{ ...valid, tag: "v 1" }, "tag", "A tag has no spaces. Enter it as it appears on GitHub."],
    [{ ...valid, environment: "" }, "environment", "Enter a value."],
    [{ ...valid, environment: "x".repeat(51) }, "environment", undefined],
    [{ ...valid, deployedOn: "" }, "deployedOn", "Enter the date the release was deployed."],
    [{ ...valid, deployedOn: "26/09/2026" }, "deployedOn", "Enter the date as YYYY-MM-DD."],
    [{ ...valid, deployedOn: "2999-01-01" }, "deployedOn", "A deployment date can't be in the future."],
    [{ ...valid, tag: "v9.9" }, "tag", "GitHub has no published release tagged v9.9 in acme/web."],
  ] as const) {
    const response = await member.post(path, body);
    expect(response.status(), JSON.stringify(body)).toBe(400);
    const errors = (await response.json()).errors;
    expect(Object.keys(errors), JSON.stringify(body)).toEqual([field]);
    if (message) expect(errors[field][0]).toBe(message);
  }
  for (const role of ["reviewer", "observer"]) expect((await (await as(request, role)).post(path, valid)).status(), role).toBe(403);
  expect((await (await as(request, "outsider")).post(path, valid)).status()).toBe(404);
  expect((await member.post(path, valid)).status()).toBe(201);
  const duplicate = await member.post(path, valid);
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).detail).toBe("v1.2 is already recorded as deployed to Production.");

  // GitHub failing while comparing saves nothing.
  await request.post(`${gitHub}/__github/faults`, { data: { bearer: "installation", path: `^/repositories/${repositoryId}/compare/`, status: 500, times: 1 } });
  expect((await member.post(path, { ...valid, environment: "Staging" })).status()).toBe(502);
  expect(await (await member.get(path)).json()).toHaveLength(1);

  // Without a repository, or once the project is archived, nothing can be recorded.
  await database.pool.query("DELETE FROM public.project_repositories WHERE project_id = $1", [projectId]);
  expect((await (await member.post(path, { ...valid, environment: "Staging" })).json()).detail).toBe("Connect a GitHub repository to this project first.");
  expect(await (await member.get(path)).json()).toHaveLength(1);
  await (await as(request, "owner")).post(`/projects/${projectId}/archive`);
  expect((await member.post(path, { ...valid, environment: "QA" })).status()).toBe(409);
});

test("refreshing compares the release with changes linked since, and keeps who recorded it", async ({ request }) => {
  const { projectId, search, docs } = await setUp(request);
  const member = await as(request, "member");
  const owner = await as(request, "owner");
  const release = await (await member.post(`/projects/${projectId}/releases`, { tag: "v2.0", environment: "Production", deployedOn: "2026-10-06" })).json();
  expect(release.requirements.map((requirement: { title: string }) => requirement.title)).toEqual(["Checkout", "Search"]);

  // A change linked after recording is not included until the release is compared again.
  expect((await member.post(`/requirements/${docs}/evidence`, { reference: late })).status()).toBe(201);
  const stale = await (await member.get(`/releases/${release.id}`)).json();
  expect(stale.requirements.map((requirement: { title: string }) => requirement.title)).toEqual(["Checkout", "Search"]);
  const refreshed = await owner.post(`/releases/${release.id}/refresh`);
  expect(refreshed.status()).toBe(200);
  const after = await refreshed.json();
  expect(after.requirements.map((requirement: { id: string }) => requirement.id)).toEqual(expect.arrayContaining([search, docs]));
  expect(after.requirements.map((requirement: { title: string }) => requirement.title)).toEqual(["Checkout", "Docs", "Search"]);
  expect(after).toMatchObject({ recordedBy: "member", recordedAt: release.recordedAt, compared: stale.compared + 1 });
  expect(Date.parse(after.comparedAt)).toBeGreaterThan(Date.parse(release.comparedAt));

  for (const role of ["reviewer", "observer"]) expect((await (await as(request, role)).post(`/releases/${release.id}/refresh`)).status(), role).toBe(403);
  expect((await (await as(request, "outsider")).post(`/releases/${release.id}/refresh`)).status()).toBe(404);
  await database.pool.query("UPDATE public.project_repositories SET repository_id = repository_id + 1 WHERE project_id = $1", [projectId]);
  const other = await member.post(`/releases/${release.id}/refresh`);
  expect(other.status()).toBe(409);
  expect((await other.json()).detail).toBe("This release is from a repository that is no longer connected, so it can't be compared again.");
});

test("the migration protects the table, constrains its rows, and rolls back only the release records", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count as number;
  const { rows: [security] } = await database.pool.query(`SELECT relrowsecurity AS rls FROM pg_class WHERE relname = 'project_releases'`);
  expect(security.rls).toBe(true);
  const { rows: grants } = await database.pool.query(`SELECT grantee FROM information_schema.role_table_grants
    WHERE table_name = 'project_releases' AND grantee IN ('anon','authenticated','PUBLIC')`);
  expect(grants).toEqual([]);
  const { rows: [project] } = await database.pool.query("SELECT id FROM public.projects LIMIT 1");
  const insert = (overrides: Record<string, unknown>) => {
    const row = { project_id: project.id, repository_id: 1, tag: "v1", name: "v1", sha: sha("1"), url: "https://github.com/a/b",
      prerelease: false, published_at: "2026-01-01T00:00:00Z", environment: "Production", deployed_on: "2026-01-02",
      recorded_by: "owner", contains: "{}", compared_at: "2026-01-02T00:00:00Z", ...overrides };
    const names = Object.keys(row);
    return database.pool.query(`INSERT INTO public.project_releases (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
  };
  for (const overrides of [{ environment: "" }, { environment: " Prod" }, { environment: "x".repeat(51) }, { sha: "abc" }, { tag: "" }]) {
    await expect(insert(overrides), JSON.stringify(overrides)).rejects.toThrow(/check constraint/);
  }
  await insert({ tag: "only-once" });
  await expect(insert({ tag: "only-once" })).rejects.toThrow(/duplicate key/);
  await expect(database.pool.query("DELETE FROM public.projects WHERE id = $1", [project.id])).rejects.toThrow(/foreign key/);

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  const requirements = await count("SELECT count(*)::int AS count FROM public.requirement_evidence");
  await database.pool.query(await readFile("docs/schema/project-releases-rollback.sql", "utf8"));
  expect(await count(`SELECT count(*)::int AS count FROM pg_tables WHERE tablename = 'project_releases'`)).toBe(0);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence")).toBe(requirements);
  await database.pool.query(await readFile("docs/schema/project-releases.sql", "utf8"));
});
