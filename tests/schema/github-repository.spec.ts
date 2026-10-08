import { expect, test, type APIRequestContext } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import type { Server } from "node:http";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startFakeGitHub } from "../../scripts/test-github.mjs";
import { startApi } from "../support/api-process";

// The repository connection API (ADR-032) called directly, as any signed-in user could,
// against a disposable PostgreSQL database and a local stand-in for GitHub.
const issuer = "http://127.0.0.1:5101";
const gitHub = "http://127.0.0.1:5109";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let unconfigured: Awaited<ReturnType<typeof startApi>>;
let fake: Server;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  const url = new URL(database.connectionString);
  const connection = `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`;
  fake = await startFakeGitHub({ port: 5109, appId: "777", publicKey: key.publicKey });
  api = await startApi(5110, {
    ConnectionStrings__Database: connection, Auth__Issuer: issuer, GitHub__ApiBaseUrl: gitHub, GitHub__AppId: "777",
    GitHub__AppSlug: "specthread-test", GitHub__PrivateKey: String(key.privateKey.export({ type: "pkcs1", format: "pem" })).replaceAll("\n", "\\n"),
  });
  unconfigured = await startApi(5111, { ConnectionStrings__Database: connection, Auth__Issuer: issuer, GitHub__ApiBaseUrl: gitHub });
});
test.afterAll(async () => {
  api?.stop();
  unconfigured?.stop();
  await new Promise(resolve => fake ? fake.close(resolve) : resolve(undefined));
  await database?.stop();
});

async function as(request: APIRequestContext, sub: string, base = api) {
  const minted = await request.post(`${issuer}/sign`, { data: { claims: { sub } } });
  const headers = { authorization: `Bearer ${(await minted.json()).token}` };
  const url = (path: string) => `${base.baseURL}${path}`;
  return {
    get: (path: string) => request.get(url(path), { headers }),
    post: (path: string, data?: object) => request.post(url(path), { headers, data }),
    put: (path: string, data: object) => request.put(url(path), { headers, data }),
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

type Repositories = { id: number; owner: string; name: string; private?: boolean }[];
async function gitHubShows(request: APIRequestContext, token: string, installations: { id: number; appInstalled?: boolean; repositories: Repositories }[]) {
  expect((await request.put(`${gitHub}/__github/users/${token}`, { data: { installations } })).status()).toBe(204);
}

async function createProject(request: APIRequestContext) {
  const owner = await as(request, "owner");
  const project = await (await owner.post("/projects", { name: "Checkout" })).json();
  expect((await owner.post(`/projects/${project.id}/members`, { email: "member@example.invalid" })).status()).toBe(201);
  return project.id as string;
}

test("the owner connects, replaces, and disconnects a repository GitHub shows them", async ({ request }) => {
  const projectId = await createProject(request);
  const owner = await as(request, "owner");
  await gitHubShows(request, "owner-token", [{ id: 11, repositories: [{ id: 101, owner: "acme", name: "web", private: true }, { id: 102, owner: "acme", name: "api" }] }]);
  expect(await (await owner.get(`/projects/${projectId}/repository`)).json()).toEqual({ repository: null });

  const connected = await owner.put(`/projects/${projectId}/repository`, { installationId: 11, repositoryId: 101, githubToken: "owner-token" });
  expect(connected.status()).toBe(200);
  const { repository } = await connected.json();
  expect(repository).toMatchObject({
    installationId: 11, repositoryId: 101, owner: "acme", name: "web", fullName: "acme/web",
    url: "https://github.com/acme/web", isPrivate: true, connectedBy: "owner",
  });
  // The stored row matches what was returned, and the user's GitHub token is stored nowhere.
  expect((await (await owner.get(`/projects/${projectId}/repository`)).json()).repository).toEqual(repository);
  const { rows } = await database.pool.query("SELECT * FROM public.project_repositories WHERE project_id = $1", [projectId]);
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain("owner-token");

  const replaced = await owner.put(`/projects/${projectId}/repository`, { installationId: 11, repositoryId: 102, githubToken: "owner-token" });
  expect((await replaced.json()).repository).toMatchObject({ repositoryId: 102, fullName: "acme/api", isPrivate: false });
  expect((await database.pool.query("SELECT count(*)::int AS count FROM public.project_repositories WHERE project_id = $1", [projectId])).rows[0].count).toBe(1);

  expect((await owner.delete(`/projects/${projectId}/repository`)).status()).toBe(204);
  expect((await owner.delete(`/projects/${projectId}/repository`)).status()).toBe(204);
  expect(await (await owner.get(`/projects/${projectId}/repository`)).json()).toEqual({ repository: null });
});

test("only the owner changes the connection; members read it; others cannot tell the project exists", async ({ request }) => {
  const projectId = await createProject(request);
  const [owner, member, outsider] = [await as(request, "owner"), await as(request, "member"), await as(request, "outsider")];
  await gitHubShows(request, "shared-token", [{ id: 21, repositories: [{ id: 201, owner: "acme", name: "web" }] }]);
  const body = { installationId: 21, repositoryId: 201, githubToken: "shared-token" };

  expect((await member.put(`/projects/${projectId}/repository`, body)).status()).toBe(403);
  expect((await outsider.put(`/projects/${projectId}/repository`, body)).status()).toBe(404);
  expect((await outsider.get(`/projects/${projectId}/repository`)).status()).toBe(404);
  expect((await outsider.delete(`/projects/${projectId}/repository`)).status()).toBe(404);
  expect(await (await member.get(`/projects/${projectId}/repository`)).json()).toEqual({ repository: null });

  expect((await owner.put(`/projects/${projectId}/repository`, body)).status()).toBe(200);
  expect((await (await member.get(`/projects/${projectId}/repository`)).json()).repository.fullName).toBe("acme/web");
  expect((await member.delete(`/projects/${projectId}/repository`)).status()).toBe(403);

  expect((await owner.post(`/projects/${projectId}/archive`)).status()).toBe(200);
  expect((await owner.put(`/projects/${projectId}/repository`, body)).status()).toBe(409);
  expect((await owner.delete(`/projects/${projectId}/repository`)).status()).toBe(409);
  expect((await (await member.get(`/projects/${projectId}/repository`)).json()).repository.fullName).toBe("acme/web");
});

test("a repository is connected only when GitHub shows it to that user through that installation", async ({ request }) => {
  const projectId = await createProject(request);
  const owner = await as(request, "owner");
  await gitHubShows(request, "owner-token", [{ id: 31, repositories: [{ id: 301, owner: "acme", name: "mine" }] }, { id: 33, appInstalled: false, repositories: [{ id: 303, owner: "acme", name: "uninstalled" }] }]);
  await gitHubShows(request, "other-token", [{ id: 32, repositories: [{ id: 302, owner: "rival", name: "secret", private: true }] }]);
  const put = (data: object) => owner.put(`/projects/${projectId}/repository`, data);

  // Someone else's installation, someone else's repository, and a mismatched pair are all refused.
  for (const data of [
    { installationId: 32, repositoryId: 302, githubToken: "owner-token" },
    { installationId: 31, repositoryId: 302, githubToken: "owner-token" },
    { installationId: 31, repositoryId: 999, githubToken: "owner-token" },
  ]) {
    const response = await put(data);
    expect(response.status()).toBe(400);
    expect((await response.json()).errors.repositoryId).toBeDefined();
  }
  const unknownToken = await put({ installationId: 31, repositoryId: 301, githubToken: "never-issued" });
  expect(unknownToken.status()).toBe(400);
  expect((await unknownToken.json()).errors.githubToken).toBeDefined();
  const uninstalled = await put({ installationId: 33, repositoryId: 303, githubToken: "owner-token" });
  expect(uninstalled.status()).toBe(400);
  expect((await uninstalled.json()).errors.installationId).toBeDefined();

  for (const [data, field] of [
    [{ installationId: 31, repositoryId: 301 }, "githubToken"],
    [{ installationId: 31, repositoryId: 301, githubToken: "   " }, "githubToken"],
    [{ installationId: 31, repositoryId: 301, githubToken: "x".repeat(1001) }, "githubToken"],
    [{ installationId: 0, repositoryId: 301, githubToken: "owner-token" }, "installationId"],
    [{ repositoryId: 301, githubToken: "owner-token" }, "installationId"],
    [{ installationId: 31, repositoryId: -5, githubToken: "owner-token" }, "repositoryId"],
  ] as const) {
    const response = await put(data);
    expect(response.status(), JSON.stringify(data)).toBe(400);
    expect((await response.json()).errors[field], field).toBeDefined();
  }
  expect(await (await owner.get(`/projects/${projectId}/repository`)).json()).toEqual({ repository: null });
});

test("listing shows every repository across installations in name order and stops at a limit", async ({ request }) => {
  const owner = await as(request, "owner");
  const many = Array.from({ length: 150 }, (_, index) => ({ id: 1000 + index, owner: "acme", name: `repo-${String(index).padStart(3, "0")}` }));
  await gitHubShows(request, "many-token", [{ id: 41, repositories: many }, { id: 42, repositories: [{ id: 5000, owner: "Zeta", name: "last" }, { id: 5001, owner: "aaa", name: "first", private: true }] }]);
  const listed = await (await owner.post("/github/repositories", { githubToken: "many-token" })).json();
  expect(listed.installUrl).toBe("https://github.com/apps/specthread-test/installations/new");
  expect(listed.truncated).toBe(false);
  expect(listed.repositories).toHaveLength(152);
  expect(listed.repositories[0]).toEqual({ installationId: 42, repositoryId: 5001, owner: "aaa", name: "first", fullName: "aaa/first", isPrivate: true });
  expect(listed.repositories.at(-1).fullName).toBe("Zeta/last");

  // A repository beyond the first page of an installation can still be connected.
  const projectId = await createProject(request);
  expect((await owner.put(`/projects/${projectId}/repository`, { installationId: 41, repositoryId: 1149, githubToken: "many-token" })).status()).toBe(200);

  await gitHubShows(request, "huge-token", [{ id: 43, repositories: Array.from({ length: 620 }, (_, index) => ({ id: 9000 + index, owner: "acme", name: `r${index}` })) }]);
  const huge = await (await owner.post("/github/repositories", { githubToken: "huge-token" })).json();
  expect(huge.truncated).toBe(true);
  expect(huge.repositories).toHaveLength(500);

  expect(await (await owner.post("/github/repositories", { githubToken: "many-token" })).json()).toMatchObject({ truncated: false });
  await gitHubShows(request, "empty-token", []);
  expect(await (await owner.post("/github/repositories", { githubToken: "empty-token" })).json()).toEqual({
    installUrl: "https://github.com/apps/specthread-test/installations/new", repositories: [], truncated: false,
  });
  const rejected = await owner.post("/github/repositories", { githubToken: "never-issued" });
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).errors.githubToken).toBeDefined();
  expect((await owner.post("/github/repositories", {})).status()).toBe(400);
});

test("GitHub failures become 502, and a deployment without app credentials answers 503", async ({ request }) => {
  const projectId = await createProject(request);
  const owner = await as(request, "owner");
  await gitHubShows(request, "flaky-token", [{ id: 51, repositories: [{ id: 501, owner: "acme", name: "web" }] }]);
  const fault = (data: object) => request.post(`${gitHub}/__github/faults`, { data });
  const body = { installationId: 51, repositoryId: 501, githubToken: "flaky-token" };

  for (const data of [
    { bearer: "flaky-token", path: "^/user/installations", status: 500, times: 1 },
    { bearer: "flaky-token", path: "^/user/installations", status: 429, times: 1 },
    { bearer: "flaky-token", path: "^/user/installations", status: 200, body: [], times: 1 },
    { bearer: "flaky-token", path: "^/user/installations", status: 403, body: { message: "Forbidden" }, times: 1 },
  ]) {
    await fault(data);
    const response = await owner.post("/github/repositories", { githubToken: "flaky-token" });
    expect(response.status(), JSON.stringify(data)).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("flaky-token");
  }

  // A dropped connection is retried once by the HTTP client, so the fault stays until it is removed.
  await fault({ bearer: "flaky-token", path: "^/user/installations", close: true });
  expect((await owner.post("/github/repositories", { githubToken: "flaky-token" })).status()).toBe(502);
  expect((await request.delete(`${gitHub}/__github/faults?bearer=flaky-token`)).status()).toBe(204);

  await fault({ bearer: "app", path: "/access_tokens$", status: 500, times: 1 });
  expect((await owner.put(`/projects/${projectId}/repository`, body)).status()).toBe(502);
  await fault({ bearer: "app", path: "/access_tokens$", status: 401, times: 1 });
  expect((await owner.put(`/projects/${projectId}/repository`, body)).status()).toBe(503);
  expect(await (await owner.get(`/projects/${projectId}/repository`)).json()).toEqual({ repository: null });

  // Without GitHub:AppId and GitHub:PrivateKey, listing still works but nothing can be connected.
  const bare = await as(request, "owner", unconfigured);
  const listed = await (await bare.post("/github/repositories", { githubToken: "flaky-token" })).json();
  expect(listed).toMatchObject({ installUrl: null, truncated: false });
  expect((await bare.put(`/projects/${projectId}/repository`, body)).status()).toBe(503);
  expect((await owner.put(`/projects/${projectId}/repository`, body)).status()).toBe(200);
});

test("anonymous callers are refused before GitHub or the database is touched", async ({ request }) => {
  const id = "00000000-0000-4000-8000-000000000000";
  for (const response of [
    await request.post(`${api.baseURL}/github/repositories`, { data: { githubToken: "x" } }),
    await request.get(`${api.baseURL}/projects/${id}/repository`),
    await request.put(`${api.baseURL}/projects/${id}/repository`, { data: { installationId: 1, repositoryId: 1, githubToken: "x" } }),
    await request.delete(`${api.baseURL}/projects/${id}/repository`),
  ]) expect(response.status()).toBe(401);
});

test("the migration protects the new table and its rollback removes only that table", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='project_repositories' AND rowsecurity")).toBe(1);
  expect(await count("SELECT count(*)::int AS count FROM pg_policies WHERE tablename='project_repositories'")).toBe(0);
  for (const role of ["anon", "authenticated"]) {
    expect(await count(`SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_name='project_repositories' AND grantee='${role}'`)).toBe(0);
  }
  await expect(database.pool.query("INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by) VALUES (gen_random_uuid(),1,1,'a','b',false,'owner')"))
    .rejects.toThrow(/foreign key/);
  const { rows: [project] } = await database.pool.query("SELECT id FROM public.projects LIMIT 1");
  await database.pool.query("DELETE FROM public.project_repositories WHERE project_id = $1", [project.id]);
  await expect(database.pool.query("INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by) VALUES ($1,0,1,'a','b',false,'owner')", [project.id]))
    .rejects.toThrow(/check constraint/);
  await expect(database.pool.query("INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by) VALUES ($1,1,1,' ','b',false,'owner')", [project.id]))
    .rejects.toThrow(/check constraint/);

  const { readFile } = await import("node:fs/promises");
  await database.pool.query(await readFile("docs/schema/project-repositories-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='project_repositories'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename IN ('projects','requirements','rateLimit')")).toBe(3);
  // InitialSchema, AuthRateLimits, and the later RequirementEvidence and EvidenceCommits remain.
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(4);
});
