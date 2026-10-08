import { expect, test, type APIRequestContext } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startFakeGitHub } from "../../scripts/test-github.mjs";
import { startApi } from "../support/api-process";

// The evidence API (ADR-033) called directly, against a disposable PostgreSQL database and a
// local stand-in for GitHub.
const issuer = "http://127.0.0.1:5101";
const gitHub = "http://127.0.0.1:5113";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let fake: Server;
let nextId = 1000;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  const url = new URL(database.connectionString);
  fake = await startFakeGitHub({ port: 5113, appId: "888", publicKey: key.publicKey });
  api = await startApi(5114, {
    ConnectionStrings__Database: `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`,
    Auth__Issuer: issuer, GitHub__ApiBaseUrl: gitHub, GitHub__AppId: "888",
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
    delete: (path: string) => request.delete(url(path), { headers }),
  };
}

type Commit = { sha: string; message: string; date: string; login?: string | null; name?: string; additions?: number; deletions?: number; files?: number };
type Item = {
  number: number; pull?: boolean; merged?: boolean; title: string; state: string; user?: string | null; created_at: string; updated_at: string;
  closed_at?: string; additions?: number; deletions?: number; changed_files?: number; commit_count?: number; commits?: Commit[]; merge_sha?: string;
};
const sha = (start: string) => start.padEnd(40, "0");
const item = (number: number, title: string, extra: Partial<Item> = {}): Item =>
  ({ number, title, state: "open", user: "ada", created_at: `2026-09-${String(number % 28 + 1).padStart(2, "0")}T10:00:00Z`, updated_at: "2026-10-01T10:00:00Z", ...extra });

/** A project with a member, one requirement, and a connected repository GitHub knows with these items. */
async function setUp(request: APIRequestContext, items: Item[], { connected = true, appInstalled = true } = {}) {
  const owner = await as(request, "owner");
  const project = await (await owner.post("/projects", { name: "Checkout" })).json();
  expect((await owner.post(`/projects/${project.id}/members`, { email: "member@example.invalid" })).status()).toBe(201);
  const requirement = await (await owner.post(`/projects/${project.id}/requirements`, { title: "Guest checkout" })).json();
  const [installationId, repositoryId] = [nextId++, nextId++];
  await request.put(`${gitHub}/__github/users/seed-${installationId}`, { data: { installations: [{ id: installationId, appInstalled, repositories: [{ id: repositoryId, owner: "acme", name: "web" }] }] } });
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/items`, { data: { items } });
  if (connected) {
    await database.pool.query(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
      VALUES ($1,$2,$3,'acme','web',false,'owner')`, [project.id, installationId, repositoryId]);
  }
  return { projectId: project.id as string, requirementId: requirement.id as string, path: `/requirements/${requirement.id}/evidence`, repositoryId, installationId };
}

test("members link issues and pull requests, read them oldest first, refresh, and unlink", async ({ request }) => {
  const { path, repositoryId } = await setUp(request, [
    item(20, "Guests cannot pay"),
    item(5, "Add guest checkout", { pull: true, user: "grace" }),
    item(2, "Spike", { pull: true, merged: true, state: "closed", closed_at: "2026-09-04T10:00:00Z", user: null }),
  ]);
  const member = await as(request, "member");
  expect(await (await member.get(path)).json()).toEqual([]);

  const linked = await member.post(path, { reference: "  #20 " });
  expect(linked.status()).toBe(201);
  const first = await linked.json();
  expect(first).toMatchObject({
    kind: "issue", number: 20, title: "Guests cannot pay", state: "open", author: "ada", repository: "acme/web",
    url: "https://github.com/acme/repo/issues/20", githubCreatedAt: "2026-09-21T10:00:00Z", githubClosedAt: null, linkedBy: "member",
  });
  expect(linked.headers().location).toBe(`${path}/${first.id}`);
  expect((await (await member.post(path, { reference: "5" })).json())).toMatchObject({ kind: "pull_request", state: "open", author: "grace" });
  expect((await (await member.post(path, { reference: "https://github.com/ACME/Web/pull/2" })).json()))
    .toMatchObject({ kind: "pull_request", state: "merged", author: null, githubClosedAt: "2026-09-04T10:00:00Z" });
  expect((await (await member.get(path)).json()).map((e: { number: number }) => e.number)).toEqual([2, 5, 20]);

  await request.put(`${gitHub}/__github/repositories/${repositoryId}/items`, { data: { items: [
    item(20, "Guests cannot pay (fixed)", { state: "closed", closed_at: "2026-10-06T10:00:00Z" }),
    item(5, "Add guest checkout", { pull: true, merged: true, state: "closed", closed_at: "2026-10-06T10:00:00Z", user: "grace" }),
  ] } });
  const refreshed = await member.post(`${path}/refresh`);
  expect(refreshed.status()).toBe(200);
  const after = await refreshed.json();
  expect(after.map((e: { number: number; state: string; title: string }) => [e.number, e.state, e.title])).toEqual([
    [2, "merged", "Spike"], [5, "merged", "Add guest checkout"], [20, "closed", "Guests cannot pay (fixed)"],
  ]);
  // The item GitHub no longer has keeps its snapshot and its earlier read time.
  expect(Date.parse(after[0].refreshedAt)).toBeLessThan(Date.parse(after[1].refreshedAt));
  expect(after[2].linkedAt).toBe(first.linkedAt);

  expect((await member.delete(`${path}/${first.id}`)).status()).toBe(204);
  expect((await member.delete(`${path}/${first.id}`)).status()).toBe(404);
  expect(await (await member.get(path)).json()).toHaveLength(2);
});

test("references are validated, and duplicates, other repositories, and missing items are refused", async ({ request }) => {
  const { path } = await setUp(request, [item(7, "Real")]);
  const owner = await as(request, "owner");
  expect((await owner.post(path, { reference: "7" })).status()).toBe(201);

  for (const reference of [undefined, "", "   ", "seven", "0", "-7", "7.5", "#", "1234567890", "x".repeat(301),
    "http://github.com/acme/web/issues/7", "https://github.com/acme/web/issues/", "https://github.com/acme/web/commit/7",
    "https://github.com.evil.example/acme/web/issues/7", "https://evil.example/https://github.com/acme/web/issues/7", "7 OR 1=1"]) {
    const response = await owner.post(path, { reference });
    expect(response.status(), String(reference)).toBe(400);
    expect((await response.json()).errors.reference, String(reference)).toBeDefined();
  }
  for (const [reference, text] of [
    ["99", "GitHub has no issue or pull request #99 in acme/web."],
    ["https://github.com/rival/secret/issues/7", "That link is not in acme/web"],
  ] as const) {
    const response = await owner.post(path, { reference });
    expect(response.status()).toBe(400);
    expect((await response.json()).errors.reference[0]).toContain(text);
  }
  for (const reference of ["7", "#7", "https://github.com/acme/web/issues/7#issuecomment-1"]) {
    const duplicate = await owner.post(path, { reference });
    expect(duplicate.status(), reference).toBe(409);
    expect((await duplicate.json()).detail).toBe("#7 is already linked to this requirement.");
  }
  expect(await (await owner.get(path)).json()).toHaveLength(1);
});

test("only project members reach evidence, and archived or unconnected projects refuse changes", async ({ request }) => {
  const { path, projectId, requirementId } = await setUp(request, [item(1, "One"), item(2, "Two")]);
  const [owner, outsider] = [await as(request, "owner"), await as(request, "outsider")];
  const linked = await (await owner.post(path, { reference: "1" })).json();

  for (const response of [
    await outsider.get(path), await outsider.post(path, { reference: "2" }),
    await outsider.post(`${path}/refresh`), await outsider.delete(`${path}/${linked.id}`),
    await request.get(`${api.baseURL}${path}`), await request.post(`${api.baseURL}${path}`, { data: { reference: "2" } }),
    await request.post(`${api.baseURL}${path}/refresh`), await request.delete(`${api.baseURL}${path}/${linked.id}`),
  ].entries()) expect(response[1].status(), String(response[0])).toBe(response[0] < 4 ? 404 : 401);

  // An evidence ID from another requirement is not found here.
  const other = await setUp(request, [item(1, "One")]);
  const foreign = await (await owner.post(other.path, { reference: "1" })).json();
  expect((await owner.delete(`${path}/${foreign.id}`)).status()).toBe(404);
  expect(await (await owner.get(other.path)).json()).toHaveLength(1);

  expect((await owner.post(`/requirements/${requirementId}/archive`)).status()).toBe(200);
  for (const response of [await owner.post(path, { reference: "2" }), await owner.post(`${path}/refresh`), await owner.delete(`${path}/${linked.id}`)]) {
    expect(response.status()).toBe(409);
  }
  expect(await (await owner.get(path)).json()).toHaveLength(1);

  const archivedProject = await setUp(request, [item(1, "One")]);
  expect((await owner.post(`/projects/${archivedProject.projectId}/archive`)).status()).toBe(200);
  expect((await owner.post(archivedProject.path, { reference: "1" })).status()).toBe(409);

  const unconnected = await setUp(request, [item(1, "One")], { connected: false });
  for (const response of [await owner.post(unconnected.path, { reference: "1" }), await owner.post(`${unconnected.path}/refresh`)]) {
    expect(response.status()).toBe(409);
    expect((await response.json()).detail).toBe("Connect a GitHub repository to this project first.");
  }
  expect(projectId).not.toBe(unconnected.projectId);
});

test("a requirement holds at most 50 links", async ({ request }) => {
  const { path, requirementId, repositoryId } = await setUp(request, [item(60, "One too many")]);
  await database.pool.query(`INSERT INTO public.requirement_evidence
    (requirement_id,kind,repository_id,repository_owner,repository_name,number,title,state,url,github_created_at,github_updated_at,linked_by)
    SELECT $1,'issue',$2,'acme','web',n,'Seeded','open','https://github.com/acme/web/issues/'||n,now(),now(),'owner' FROM generate_series(1,50) AS n`,
    [requirementId, repositoryId]);
  const owner = await as(request, "owner");
  const refused = await owner.post(path, { reference: "60" });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).detail).toBe("A requirement can have at most 50 evidence links.");
  expect(await (await owner.get(path)).json()).toHaveLength(50);
});

test("GitHub failures map to 502, 503, and 409 and never save a partial refresh", async ({ request }) => {
  const { path, repositoryId, installationId } = await setUp(request, [item(1, "One"), item(2, "Two")]);
  const owner = await as(request, "owner");
  expect((await owner.post(path, { reference: "1" })).status()).toBe(201);
  expect((await owner.post(path, { reference: "2" })).status()).toBe(201);
  const before = await (await owner.get(path)).json();
  const fault = (data: object) => request.post(`${gitHub}/__github/faults`, { data });
  const clear = (bearer: string) => request.delete(`${gitHub}/__github/faults?bearer=${bearer}`);

  await request.put(`${gitHub}/__github/repositories/${repositoryId}/items`, { data: { items: [item(1, "One changed"), item(2, "Two changed"), item(3, "Three")] } });
  for (const [bearer, data, status] of [
    ["installation", { path: `^/repositories/${repositoryId}/issues/2$`, status: 500 }, 502],
    ["installation", { path: `^/repositories/${repositoryId}/issues/2$`, close: true }, 502],
    ["installation", { path: `^/repositories/${repositoryId}/issues/2$`, status: 200, body: { number: 2, title: 5 } }, 502],
    ["installation", { path: `^/repositories/${repositoryId}/issues/2$`, status: 200, body: { number: 9, title: "Wrong item", state: "open", html_url: "https://github.com/a/b/issues/9", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" } }, 502],
    ["installation", { path: `^/repositories/${repositoryId}/issues/2$`, status: 200, body: { number: 2, title: "Bad link", state: "open", html_url: "https://evil.example/2", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" } }, 502],
    ["app", { path: `^/app/installations/${installationId}/access_tokens$`, status: 401 }, 503],
    ["app", { path: `^/app/installations/${installationId}/access_tokens$`, status: 404 }, 409],
    ["app", { path: `^/app/installations/${installationId}/access_tokens$`, status: 201, body: {} }, 502],
  ] as const) {
    await fault({ bearer, ...data });
    expect((await owner.post(`${path}/refresh`)).status(), JSON.stringify(data)).toBe(status);
    // The first item was read successfully before the failure, yet nothing was saved.
    expect(await (await owner.get(path)).json(), JSON.stringify(data)).toEqual(before);
    if (!data.path.includes("issues")) expect((await owner.post(path, { reference: "3" })).status()).toBe(status);
    await clear(bearer);
  }
  expect((await (await owner.post(`${path}/refresh`)).json()).map((e: { title: string }) => e.title)).toEqual(["One changed", "Two changed"]);
});

test("commits are linked by SHA or address with their changes, and pull requests carry their commits", async ({ request }) => {
  const [first, second, lone] = [sha("abc1234"), sha("def5678"), sha("0a1b2c3d")];
  const listed = [
    { sha: first, message: "Add guest path\n\nBody", date: "2026-09-08T09:00:00Z" },
    { sha: second, message: "   ", date: "2026-09-08T11:00:00Z", login: null, name: "Grace Hopper" },
  ];
  const { path, repositoryId } = await setUp(request, [
    item(9, "Add guest checkout", { pull: true, additions: 40, deletions: 5, changed_files: 3, commit_count: 300, commits: listed }),
  ]);
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/commits`, { data: { commits: [
    { ...listed[0], additions: 12, deletions: 3, files: 2 },
    { sha: lone, message: "x".repeat(400), date: "2026-09-20T09:00:00Z", additions: 0, deletions: 0, files: 0, login: null, name: "Grace Hopper" },
  ] } });
  const member = await as(request, "member");

  const linked = await member.post(path, { reference: " ABC1234 " });
  expect(linked.status()).toBe(201);
  expect(await linked.json()).toMatchObject({
    kind: "commit", number: null, sha: first, state: null, title: "Add guest path", author: "ada",
    url: `https://github.com/acme/repo/commit/${first}`, githubCreatedAt: "2026-09-08T09:00:00Z", githubClosedAt: null,
    additions: 12, deletions: 3, changedFiles: 2, commitCount: null, commits: null, linkedBy: "member",
  });
  const long = await (await member.post(path, { reference: `https://github.com/acme/web/commit/${lone}?diff=split` })).json();
  expect(long).toMatchObject({ kind: "commit", sha: lone, author: "Grace Hopper", additions: 0, deletions: 0, changedFiles: 0 });
  expect(long.title).toHaveLength(300);

  for (const reference of [first, first.toUpperCase(), "abc12340", `https://github.com/acme/web/pull/9/commits/${first}`]) {
    const duplicate = await member.post(path, { reference });
    expect(duplicate.status(), reference).toBe(409);
    expect((await duplicate.json()).detail).toBe("Commit abc1234 is already linked to this requirement.");
  }

  const pull = await (await member.post(path, { reference: "9" })).json();
  expect(pull).toMatchObject({ kind: "pull_request", number: 9, sha: second, state: "open", additions: 40, deletions: 5, changedFiles: 3, commitCount: 300 });
  expect(pull.commits).toEqual([
    { sha: first, message: "Add guest path", author: "ada", date: "2026-09-08T09:00:00Z", url: `https://github.com/acme/repo/commit/${first}` },
    { sha: second, message: "(no message)", author: "Grace Hopper", date: "2026-09-08T11:00:00Z", url: `https://github.com/acme/repo/commit/${second}` },
  ]);
  expect((await (await member.get(path)).json()).map((e: { kind: string }) => e.kind)).toEqual(["commit", "pull_request", "commit"]);

  for (const reference of ["abc1234 ; drop", "https://github.com/acme/web/commit/abc",
    "https://github.com/acme/web/commits/abc1234", "https://github.com/acme/web/pull/9/commits/"]) {
    const response = await member.post(path, { reference });
    expect(response.status(), reference).toBe(400);
    expect((await response.json()).errors.reference[0], reference).toContain("Enter an issue or pull request number");
  }
  // Text that is neither a number nor a SHA is looked up as a release tag.
  for (const reference of ["abc123", "g123456", "f".repeat(41)]) {
    const response = await member.post(path, { reference });
    expect(response.status(), reference).toBe(400);
    expect((await response.json()).errors.reference[0], reference).toBe(`GitHub has no release tagged ${reference} in acme/web.`);
  }
  const unknown = await member.post(path, { reference: "deadbeef" });
  expect(unknown.status()).toBe(400);
  expect((await unknown.json()).errors.reference[0]).toBe("GitHub has no commit deadbeef in acme/web.");
  const elsewhere = await member.post(path, { reference: `https://github.com/rival/secret/commit/${first}` });
  expect((await elsewhere.json()).errors.reference[0]).toContain("That link is not in acme/web");

  // Answers that are not the requested commit, or not a commit at all, are refused as GitHub failures.
  const fault = (data: object) => request.post(`${gitHub}/__github/faults`, { data });
  const good = { sha: sha("feed123"), html_url: "https://github.com/acme/repo/commit/x", commit: { message: "m", author: { name: "n", date: "2026-09-01T00:00:00Z" } }, author: null, stats: { additions: 1, deletions: 1 }, files: [] };
  for (const body of [
    { ...good, sha: sha("0000000") }, { ...good, sha: "feed123" }, { ...good, html_url: "https://evil.example/c" },
    { ...good, stats: { additions: -1, deletions: 0 } }, { ...good, files: null }, { ...good, commit: { message: "m", author: { name: "n", date: "soon" } } }, [],
  ]) {
    await fault({ bearer: "installation", path: `^/repositories/${repositoryId}/commits/feed123$`, status: 200, body, times: 1 });
    expect((await member.post(path, { reference: "feed123" })).status(), JSON.stringify(body)).toBe(502);
  }
  for (const [where, body] of [
    [`^/repositories/${repositoryId}/pulls/9$`, { merged: false, commits: 2, additions: 1, deletions: 1, changed_files: 1, head: { sha: "short" } }],
    [`^/repositories/${repositoryId}/pulls/9/commits$`, { commits: [] }],
    [`^/repositories/${repositoryId}/pulls/9/commits$`, [{ sha: "nope" }]],
  ] as const) {
    await fault({ bearer: "installation", path: where, status: 200, body, times: 1 });
    expect((await member.post(`${path}/refresh`)).status(), where).toBe(502);
  }

  // Refresh does not read commits again, so a failing commit endpoint does not stop it.
  await fault({ bearer: "installation", path: `^/repositories/${repositoryId}/commits/[0-9a-f]+$` });
  const refreshed = await member.post(`${path}/refresh`);
  expect(refreshed.status()).toBe(200);
  expect((await refreshed.json()).find((e: { kind: string }) => e.kind === "commit")).toMatchObject({ sha: first, additions: 12 });
  await request.delete(`${gitHub}/__github/faults?bearer=installation`);
  expect(await (await member.get(path)).json()).toHaveLength(3);
});

test("check results are read for pull requests and commits, normalized, and never block a link when unreadable", async ({ request }) => {
  const [head, lone, hidden, half] = [sha("abc1234"), sha("0a1b2c3d"), sha("feed123"), sha("beef456")];
  const { path, repositoryId } = await setUp(request, [
    item(3, "An issue"),
    item(9, "Add guest checkout", { pull: true, commits: [{ sha: head, message: "Add guest path", date: "2026-09-08T09:00:00Z" }] }),
  ]);
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/commits`, { data: { commits: [lone, hidden, half].map(value => ({ sha: value, message: "m", date: "2026-09-20T09:00:00Z" })) } });
  const setChecks = (commit: string, data: object) => request.put(`${gitHub}/__github/repositories/${repositoryId}/checks/${commit}`, { data });
  const run = (name: string, status: string, conclusion: string | null, extra: object = {}) =>
    ({ name, status, conclusion, html_url: `https://github.com/acme/repo/runs/${name}`, completed_at: "2026-09-08T09:30:00Z", ...extra });
  await setChecks(head, {
    runs: [
      run("success", "completed", "success"), run("failure", "completed", "failure"), run("timed_out", "completed", "timed_out"),
      run("action_required", "completed", "action_required"), run("skipped", "completed", "skipped"), run("cancelled", "completed", "cancelled"),
      run("neutral", "completed", "neutral"), run("stale", "completed", "stale"), run("queued", "queued", null),
      run("in_progress", "in_progress", null), run("  ", "completed", "success", { html_url: "https://evil.example/run" }),
    ],
    statuses: [
      { context: "status/success", state: "success", target_url: "https://github.com/acme/repo/status/1", updated_at: "2026-09-08T09:31:00Z" },
      { context: "status/failure", state: "failure", target_url: "https://ci.example/2" }, { context: "status/error", state: "error" },
      { context: "status/pending", state: "pending", updated_at: "2026-09-08T09:31:00Z" },
    ],
  });
  await setChecks(hidden, { deny: "both" });
  await setChecks(half, { deny: "runs", statuses: [{ context: "legacy", state: "success" }] });
  const member = await as(request, "member");

  const issue = await (await member.post(path, { reference: "3", source: "suggested" })).json();
  expect(issue).toMatchObject({ kind: "issue", checks: null, checkCount: null, checksReadAt: null, source: "manual" });

  const pull = await (await member.post(path, { reference: "9" })).json();
  expect(pull.checkCount).toBe(15);
  expect(pull.source).toBe("manual");
  expect(Object.fromEntries(pull.checks.map((check: { name: string; result: string }) => [check.name, check.result]))).toEqual({
    "(unnamed check)": "passed", success: "passed", failure: "failed", timed_out: "failed", action_required: "failed", skipped: "skipped",
    cancelled: "cancelled", neutral: "neutral", stale: "neutral", queued: "running", in_progress: "running",
    "status/success": "passed", "status/failure": "failed", "status/error": "failed", "status/pending": "running",
  });
  const byName = (name: string) => pull.checks.find((check: { name: string }) => check.name === name);
  expect(byName("success")).toEqual({ name: "success", result: "passed", url: "https://github.com/acme/repo/runs/success", completedAt: "2026-09-08T09:30:00Z", kind: "check" });
  expect(byName("queued")).toMatchObject({ completedAt: null, kind: "check" });
  // Links that are not on GitHub itself are dropped; the check is still listed.
  expect(byName("(unnamed check)").url).toBeNull();
  expect(byName("status/failure")).toEqual({ name: "status/failure", result: "failed", url: null, completedAt: null, kind: "status" });
  expect(byName("status/success")).toMatchObject({ url: "https://github.com/acme/repo/status/1", completedAt: "2026-09-08T09:31:00Z", kind: "status" });
  expect(byName("status/pending").completedAt).toBeNull();
  expect(pull.checks.map((check: { name: string }) => check.name)).toEqual([...pull.checks.map((check: { name: string }) => check.name)].sort((a, b) => (a.toUpperCase() < b.toUpperCase() ? -1 : 1)));

  expect(await (await member.post(path, { reference: lone })).json()).toMatchObject({ kind: "commit", checks: [], checkCount: 0 });
  const unreadable = await member.post(path, { reference: hidden });
  expect(unreadable.status()).toBe(201);
  const unreadableBody = await unreadable.json();
  expect(unreadableBody).toMatchObject({ checks: null, checkCount: null });
  expect(unreadableBody.checksReadAt).not.toBeNull();
  // One of the two permissions is enough to show what can be read.
  expect(await (await member.post(path, { reference: half })).json()).toMatchObject({ checks: [{ name: "legacy", result: "passed", kind: "status" }], checkCount: 1 });

  // More checks than one page: the first 100 are stored and the total is kept.
  await setChecks(head, { runs: Array.from({ length: 100 }, (_, index) => run(`job-${String(index).padStart(3, "0")}`, "completed", "success")), total_runs: 130, statuses: [{ context: "zz-status", state: "success" }] });
  const before = await (await member.get(path)).json();
  const fault = (data: object) => request.post(`${gitHub}/__github/faults`, { data });
  for (const [where, body, status] of [
    ["check-runs", { check_runs: [] }, 200], ["check-runs", { total_count: 1, check_runs: [{ name: "x" }] }, 200], ["check-runs", undefined, 500],
    ["status", { total_count: "many", statuses: [] }, 200], ["status", { total_count: 1, statuses: [{ state: "success" }] }, 200], ["status", undefined, 429],
  ] as const) {
    await fault({ bearer: "installation", path: `^/repositories/${repositoryId}/commits/${head}/${where}$`, status, body, times: 1 });
    expect((await member.post(`${path}/refresh`)).status(), `${where} ${JSON.stringify(body)}`).toBe(502);
    // The commits were read before the pull request failed, yet nothing was saved.
    expect(await (await member.get(path)).json()).toEqual(before);
  }
  const refreshed = await (await member.post(`${path}/refresh`)).json();
  const again = refreshed.find((e: { number: number | null }) => e.number === 9);
  expect(again.checks).toHaveLength(100);
  expect(again.checkCount).toBe(131);
  expect(refreshed.find((e: { sha: string | null; kind: string }) => e.kind === "commit" && e.sha === hidden).checks).toBeNull();
});

test("releases are linked by tag or address, and each records which linked changes its history includes", async ({ request }) => {
  const [head, squash, early, late, gone, added] = [sha("abc1234"), sha("5ca1ab1e"), sha("0a1b2c3d"), sha("feed123"), sha("dead999"), sha("beef456")];
  const [one, two] = [sha("1111111"), sha("2222222")];
  const { path, repositoryId } = await setUp(request, [
    item(3, "An issue"),
    item(9, "Add guest checkout", { pull: true, merged: true, state: "closed", merge_sha: squash, commits: [{ sha: head, message: "Add guest path", date: "2026-09-09T09:00:00Z" }] }),
    item(10, "Remember the cart", { pull: true, commits: [{ sha: late, message: "WIP", date: "2026-09-10T09:00:00Z" }] }),
  ]);
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/commits`, { data: { commits: [early, late, gone, added].map(value => ({ sha: value, message: "m", date: "2026-09-20T09:00:00Z" })) } });
  const setReleases = (first: string[]) => request.put(`${gitHub}/__github/repositories/${repositoryId}/releases`, { data: { releases: [
    { tag: "v1.4.0", name: "  Guest checkout  ", published_at: "2026-09-25T10:00:00Z", sha: one, contains: first, unknown: [gone] },
    { tag: "release/2.0-rc.1", prerelease: true, published_at: "2026-09-30T10:00:00Z", sha: two, contains: [squash, early, late, added], author: null },
    { tag: "1234567", published_at: "2026-10-01T10:00:00Z", sha: sha("3333333") },
    { tag: "v1.0+build", published_at: "2026-10-02T10:00:00Z", sha: sha("4444444") },
  ] } });
  // The pull request's branch commit (head) is in no release; its merge commit is.
  await setReleases([squash, early]);
  const member = await as(request, "member");
  const ids: Record<string, string> = {};
  for (const reference of ["3", "9", "10", early, late, gone]) ids[reference] = (await (await member.post(path, { reference })).json()).id;

  const linked = await member.post(path, { reference: "v1.4.0" });
  expect(linked.status()).toBe(201);
  const first = await linked.json();
  expect(first).toMatchObject({
    kind: "release", tag: "v1.4.0", title: "Guest checkout", prerelease: false, sha: one, number: null, state: null, author: "ada",
    url: "https://github.com/acme/repo/releases/tag/v1.4.0", githubCreatedAt: "2026-09-25T10:00:00Z",
    checks: null, checkCount: null, checksReadAt: null, source: "manual", linkedBy: "member",
  });
  // Compared: the merged pull request and the three commits. Not compared: the issue and the open pull request.
  expect(first.contains).toEqual({ [ids["9"]]: true, [ids[early]]: true, [ids[late]]: false, [ids[gone]]: false });

  const candidate = await (await member.post(path, { reference: "https://github.com/acme/web/releases/tag/release/2.0-rc.1?expanded=true" })).json();
  expect(candidate).toMatchObject({ kind: "release", tag: "release/2.0-rc.1", title: "release/2.0-rc.1", prerelease: true, sha: two, author: null });
  expect(candidate.contains).toEqual({ [ids["9"]]: true, [ids[early]]: true, [ids[late]]: true, [ids[gone]]: false });

  for (const reference of ["v1.4.0", "https://github.com/acme/web/releases/tag/v1.4.0", "https://github.com/ACME/Web/releases/tag/release/2.0-rc.1"]) {
    const duplicate = await member.post(path, { reference });
    expect(duplicate.status(), reference).toBe(409);
    expect((await duplicate.json()).detail).toMatch(/^Release (v1\.4\.0|release\/2\.0-rc\.1) is already linked to this requirement\.$/);
  }
  // A tag made only of digits reads as an issue number, so it is linked by its address. An encoded tag is decoded.
  expect((await (await member.post(path, { reference: "1234567" })).json()).errors.reference[0]).toBe("GitHub has no issue or pull request #1234567 in acme/web.");
  expect((await (await member.post(path, { reference: "https://github.com/acme/web/releases/tag/1234567" })).json()).tag).toBe("1234567");
  expect((await (await member.post(path, { reference: "https://github.com/acme/web/releases/tag/v1.0%2Bbuild" })).json()).tag).toBe("v1.0+build");

  for (const [reference, message] of [
    ["v9.9.9", "GitHub has no release tagged v9.9.9 in acme/web."],
    ["https://github.com/rival/secret/releases/tag/v1.4.0", "That link is not in acme/web, the repository connected to this project."],
    ["v 1", "Enter an issue or pull request number, a commit SHA, a release tag, or a GitHub link to one of them."],
    ["https://github.com/acme/web/releases", "Enter an issue or pull request number, a commit SHA, a release tag, or a GitHub link to one of them."],
    ["https://github.com/acme/web/releases/tag/", "Enter an issue or pull request number, a commit SHA, a release tag, or a GitHub link to one of them."],
    ["ftp://example.com/v1", "Enter an issue or pull request number, a commit SHA, a release tag, or a GitHub link to one of them."],
    ["t".repeat(101), "Enter an issue or pull request number, a commit SHA, a release tag, or a GitHub link to one of them."],
  ] as const) {
    const response = await member.post(path, { reference });
    expect(response.status(), reference).toBe(400);
    expect((await response.json()).errors.reference[0], reference).toBe(message);
  }

  // A change linked later is compared with every release already linked.
  ids[added] = (await (await member.post(path, { reference: added })).json()).id;
  const byTag = async (tag: string) => (await (await member.get(path)).json()).find((e: { tag: string | null }) => e.tag === tag);
  expect((await byTag("v1.4.0")).contains[ids[added]]).toBe(false);
  expect((await byTag("release/2.0-rc.1")).contains[ids[added]]).toBe(true);
  expect((await byTag("1234567")).contains[ids[added]]).toBe(false);

  // Failures while comparing or re-reading a release save nothing.
  const before = await (await member.get(path)).json();
  await setReleases([squash, early, late]);
  const fault = (data: object) => request.post(`${gitHub}/__github/faults`, { data });
  for (const [where, body, status] of [
    [`^/repositories/${repositoryId}/compare/${late}\\.\\.\\.${one}$`, undefined, 500],
    [`^/repositories/${repositoryId}/compare/${late}\\.\\.\\.${one}$`, { status: "sideways" }, 200],
    [`^/repositories/${repositoryId}/compare/${late}\\.\\.\\.${one}$`, [], 200],
    [`^/repositories/${repositoryId}/releases/tags/v1\\.4\\.0$`, { tag_name: "", html_url: "https://github.com/a/b", prerelease: false, published_at: "2026-09-25T10:00:00Z" }, 200],
    [`^/repositories/${repositoryId}/releases/tags/v1\\.4\\.0$`, { tag_name: "v1.4.0", html_url: "https://evil.example/r", prerelease: false, published_at: "2026-09-25T10:00:00Z" }, 200],
    [`^/repositories/${repositoryId}/releases/tags/v1\\.4\\.0$`, { tag_name: "v1.4.0", html_url: "https://github.com/a/b", prerelease: "no", published_at: "2026-09-25T10:00:00Z" }, 200],
    [`^/repositories/${repositoryId}/commits/tags/v1\\.4\\.0$`, { sha: "short" }, 200],
    [`^/repositories/${repositoryId}/commits/tags/v1\\.4\\.0$`, undefined, 429],
  ] as const) {
    await fault({ bearer: "installation", path: where, status, body, times: 1 });
    expect((await member.post(`${path}/refresh`)).status(), `${where} ${JSON.stringify(body)}`).toBe(502);
    expect(await (await member.get(path)).json(), where).toEqual(before);
  }

  // Refresh recomputes every release: the late commit is now in v1.4.0, and an unlinked change is forgotten.
  expect((await member.delete(`${path}/${ids[early]}`)).status()).toBe(204);
  expect((await member.post(`${path}/refresh`)).status()).toBe(200);
  expect((await byTag("v1.4.0")).contains).toEqual({ [ids["9"]]: true, [ids[late]]: true, [ids[gone]]: false, [ids[added]]: false });

  // A release deleted on GitHub keeps its snapshot and is still compared through its stored commit.
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/releases`, { data: { releases: [{ tag: "kept-for-compare", published_at: "2026-09-25T10:00:00Z", sha: one, contains: [squash] }] } });
  expect((await member.post(`${path}/refresh`)).status()).toBe(200);
  expect(await byTag("v1.4.0")).toMatchObject({ title: "Guest checkout", sha: one, contains: { [ids["9"]]: true, [ids[late]]: false } });
});

test("the release migration constrains what a release row can be, and its rollback removes release links only", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  const columns = "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='requirement_evidence' AND column_name IN ('tag','prerelease','merge_sha','contains')";
  const { rows: [requirement] } = await database.pool.query("SELECT id FROM public.requirements LIMIT 1");
  const insert = (values: Record<string, unknown>) => {
    const row = { requirement_id: requirement.id, kind: "release", repository_id: 717171, repository_owner: "a", repository_name: "b",
      title: "t", url: "https://github.com/a/b/releases/tag/v1", github_created_at: new Date(), github_updated_at: new Date(), linked_by: "owner", ...values };
    const names = Object.keys(row);
    return database.pool.query(`INSERT INTO public.requirement_evidence (${names.join(",")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(row));
  };
  await insert({ tag: "v1", sha: sha("aaaaaaa"), prerelease: false, contains: JSON.stringify({}) });
  await insert({ tag: "v2" });
  await expect(insert({ tag: "v1" })).rejects.toThrow(/duplicate key/);
  for (const values of [{ tag: null }, { tag: "  " }, { tag: "v3", number: 3 }, { tag: "v3", state: "open" }, { kind: "commit", sha: sha("bbbbbbb"), tag: "v3" },
    { kind: "issue", number: 8, state: "open", tag: "v3" }, { kind: "deployment", tag: "v3" }]) {
    await expect(insert(values), JSON.stringify(values)).rejects.toThrow(/check constraint/);
  }
  await insert({ kind: "pull_request", number: 8, state: "merged", merge_sha: sha("ccccccc") });
  const others = await count("SELECT count(*)::int AS count FROM public.requirement_evidence WHERE kind <> 'release'");

  await database.pool.query(await readFile("docs/schema/evidence-releases-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence WHERE kind = 'release'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence")).toBe(others);
  expect(await count(columns)).toBe(0);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(7);
});

test("the check migration defaults every link to manual, constrains the source, and rolls back without losing links", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  const columns = "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='requirement_evidence' AND column_name IN ('checks','check_count','checks_read_at','source')";
  const { rows: [requirement] } = await database.pool.query("SELECT id FROM public.requirements LIMIT 1");
  const insert = (number: number, extra: Record<string, unknown> = {}) => {
    const row = { requirement_id: requirement.id, kind: "issue", repository_id: 616161, repository_owner: "a", repository_name: "b", number, state: "open",
      title: "t", url: "https://github.com/a/b/issues/1", github_created_at: new Date(), github_updated_at: new Date(), linked_by: "owner", ...extra };
    const names = Object.keys(row);
    return database.pool.query(`INSERT INTO public.requirement_evidence (${names.join(",")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(row));
  };
  await insert(1);
  await insert(2, { source: "suggested", checks: JSON.stringify([]), check_count: 0 });
  expect((await database.pool.query("SELECT source FROM public.requirement_evidence WHERE repository_id = 616161 ORDER BY number")).rows).toEqual([{ source: "manual" }, { source: "suggested" }]);
  for (const extra of [{ source: "ai" }, { source: "" }, { source: null }, { check_count: -1 }]) {
    await expect(insert(3, extra), JSON.stringify(extra)).rejects.toThrow(/check constraint|not-null/);
  }
  const before = await count("SELECT count(*)::int AS count FROM public.requirement_evidence");

  await database.pool.query(await readFile("docs/schema/evidence-checks-rollback.sql", "utf8"));
  expect(await count(columns)).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence")).toBe(before);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(6);
});

test("the commit migration constrains what a row can be, and its rollback removes commit links only", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  const { rows: [requirement] } = await database.pool.query("SELECT id FROM public.requirements LIMIT 1");
  const insert = (values: Record<string, unknown>) => {
    const row = { requirement_id: requirement.id, kind: "commit", repository_id: 515151, repository_owner: "a", repository_name: "b",
      title: "t", url: "https://github.com/a/b/commit/1", github_created_at: new Date(), github_updated_at: new Date(), linked_by: "owner", ...values };
    const columns = Object.keys(row);
    return database.pool.query(`INSERT INTO public.requirement_evidence (${columns.join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(row));
  };
  await insert({ sha: sha("aaaaaaa") });
  await expect(insert({ sha: sha("aaaaaaa") })).rejects.toThrow(/duplicate key/);
  for (const values of [{ sha: null }, { sha: "abc" }, { sha: sha("AAAAAAA") }, { sha: sha("bbbbbbb"), number: 4 }, { sha: sha("ccccccc"), state: "open" },
    { sha: sha("ddddddd"), additions: -1 }, { kind: "issue", number: 4, state: null }, { kind: "issue", number: null, state: "open" }, { kind: "release", sha: sha("eeeeeee") }]) {
    await expect(insert(values), JSON.stringify(values)).rejects.toThrow(/check constraint/);
  }
  await insert({ kind: "issue", number: 4, state: "open" });
  // The same number may be linked to a different requirement, and a pull request may share a commit's SHA.
  await insert({ kind: "pull_request", number: 5, state: "merged", sha: sha("aaaaaaa"), commits: JSON.stringify([]) });

  await database.pool.query(await readFile("docs/schema/evidence-commits-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence WHERE kind = 'commit'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence WHERE repository_id = 515151")).toBe(2);
  expect(await count("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='requirement_evidence' AND column_name IN ('sha','commits','additions')")).toBe(0);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(5);
});

test("the migration protects the new table and its rollback removes only that table", async () => {
  const count = async (sql: string) => (await database.pool.query(sql)).rows[0].count;
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_evidence' AND rowsecurity")).toBe(1);
  expect(await count("SELECT count(*)::int AS count FROM pg_policies WHERE tablename='requirement_evidence'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_name='requirement_evidence' AND grantee IN ('anon','authenticated')")).toBe(0);
  const { rows: [requirement] } = await database.pool.query("SELECT id FROM public.requirements LIMIT 1");
  const insert = (kind: string, state: string, number: number) => database.pool.query(`INSERT INTO public.requirement_evidence
    (requirement_id,kind,repository_id,repository_owner,repository_name,number,title,state,url,github_created_at,github_updated_at,linked_by)
    VALUES ($1,$2,424242,'a','b',$3,'t',$4,'https://github.com/a/b/issues/1',now(),now(),'owner')`, [requirement.id, kind, number, state]);
  await insert("issue", "open", 900);
  await expect(insert("issue", "open", 900)).rejects.toThrow(/duplicate key/);
  await expect(insert("commit", "open", 901)).rejects.toThrow(/check constraint/);
  await expect(insert("issue", "draft", 902)).rejects.toThrow(/check constraint/);
  await expect(insert("issue", "open", 0)).rejects.toThrow(/check constraint/);
  await expect(database.pool.query("DELETE FROM public.requirements WHERE id = $1", [requirement.id])).rejects.toThrow(/foreign key/);

  await database.pool.query(await readFile("docs/schema/requirement-evidence-rollback.sql", "utf8"));
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_evidence'")).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename IN ('project_repositories','requirements')")).toBe(2);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(4);
});
