import { expect, test, type APIRequestContext } from "@playwright/test";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startFakeGitHub } from "../../scripts/test-github.mjs";
import { startApi } from "../support/api-process";
import { stillWaiting, withTeamLock } from "../support/team-lock";

// Suggested links from explicit references, and moving a link between requirements (ADR-056),
// against a disposable PostgreSQL database and a local stand-in for GitHub.
const issuer = "http://127.0.0.1:5101";
const gitHub = "http://127.0.0.1:5130";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;
let fake: Server;
let nextId = 5000;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO public.user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  fake = await startFakeGitHub({ port: 5130, appId: "321", publicKey: key.publicKey });
  api = await startApi(5131, {
    ConnectionStrings__Database: `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`,
    Auth__Issuer: issuer, GitHub__ApiBaseUrl: gitHub, GitHub__AppId: "321",
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

type Item = { number: number; pull?: boolean; merged?: boolean; title: string; state: string; user?: string | null; body?: string; created_at: string; updated_at: string; closed_at?: string };
const item = (number: number, title: string, extra: Partial<Item> = {}): Item =>
  ({ number, title, state: "open", user: "ada", created_at: "2026-09-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", ...extra });
const pull = (number: number, title: string, body: string, extra: Partial<Item> = {}) => item(number, title, { pull: true, body, ...extra });

/** A project with a member, requirements of the given titles, and a connected repository GitHub knows with these items. */
async function setUp(request: APIRequestContext, items: Item[] | ((name: string) => Item[]), titles = ["Guest checkout", "Saved carts"], connected = true) {
  const owner = await as(request, "owner");
  const team = await (await owner.post("/teams", { name: "Product team" })).json();
  const project = await (await owner.post("/projects", { name: "Checkout", teamId: team.id })).json();
  // Fixture-only membership. In the product a person joins a team by accepting an invitation.
  await database.pool.query("INSERT INTO public.team_members (team_id,user_id) VALUES ($1,'member')", [team.id]);
  const ids: string[] = [];
  for (const title of titles) ids.push((await (await owner.post(`/projects/${project.id}/requirements`, { title, acceptanceCriteria: ["Done"] })).json()).id);
  const [installationId, repositoryId] = [nextId++, nextId++];
  const name = `web-${repositoryId}`;
  await request.put(`${gitHub}/__github/users/seed-${installationId}`, { data: { installations: [{ id: installationId, repositories: [{ id: repositoryId, owner: "acme", name }] }] } });
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/items`, { data: { items: typeof items === "function" ? items(name) : items } });
  if (connected) {
    await database.pool.query(`INSERT INTO public.project_repositories (project_id,installation_id,repository_id,owner,name,is_private,connected_by)
      VALUES ($1,$2,$3,'acme',$4,false,'owner')`, [project.id, installationId, repositoryId, name]);
  }
  return { projectId: project.id as string, ids, paths: ids.map(id => `/requirements/${id}/evidence`), name, repositoryId };
}

type Suggestion = { id: string; number: number; title: string; reference: string; state: string; author: string | null };
type Event = { action: string; label: string; actor: string; otherRequirementId: string | null; otherRequirementTitle: string | null };
const scan = async (actor: Awaited<ReturnType<typeof as>>, path: string): Promise<Suggestion[]> => {
  const response = await actor.post(`${path}/suggestions/scan`);
  expect(response.status()).toBe(200);
  return response.json();
};

test("pull requests that close a linked issue are suggested, and only those", async ({ request }) => {
  const { paths: [path], name: repository } = await setUp(request, name => [
    item(184, "Guests cannot pay"),
    pull(201, "Add guest checkout", "This work.\n\nCloses #184", { user: "grace" }),
    pull(202, "Fix the cart", "fixes: #184 and tidies up", { merged: true, state: "closed", closed_at: "2026-09-04T10:00:00Z" }),
    pull(203, "Address form", `Resolved https://github.com/acme/${name}/issues/184`),
    pull(204, "Also by name", `closed acme/${name}#184`),
    pull(205, "Only mentions it", "See #184 for background"),
    pull(206, "Another repository's issue", "Closes acme/other#184"),
    pull(207, "A longer number", "Closes #1840"),
    item(185, "Linked issue with nothing"),
    item(300, "Unlinked issue"),
    pull(301, "Closes an unlinked issue", "Closes #300"),
  ]);
  const member = await as(request, "member");
  expect((await member.post(path, { reference: "184" })).status()).toBe(201);
  expect((await member.post(path, { reference: "185" })).status()).toBe(201);
  expect(await (await member.get(`${path}/suggestions`)).json()).toEqual([]);

  const found = await scan(member, path);
  expect(found.map(s => [s.number, s.reference, s.state])).toEqual([
    [201, "Closes #184", "open"], [202, "Fixes #184", "merged"], [203, "Resolved #184", "open"], [204, "Closed #184", "open"],
  ]);
  expect(found[0]).toMatchObject({ title: "Add guest checkout", author: "grace", url: `https://github.com/acme/${repository}/pull/201` });
  expect(await (await member.get(`${path}/suggestions`)).json()).toEqual(found);
  // Scanning again changes nothing, and the description itself is not kept.
  expect(await scan(member, path)).toEqual(found);
  const { rows } = await database.pool.query("SELECT * FROM public.requirement_evidence_suggestions");
  expect(JSON.stringify(rows)).not.toContain("tidies up");
});

test("a suggestion is not evidence until it is confirmed, and confirming and rejecting are recorded", async ({ request }) => {
  const { projectId, ids: [id], paths: [path] } = await setUp(request, [
    item(1, "Guests cannot pay"), pull(2, "Add guest checkout", "Closes #1"), pull(3, "Wrong one", "Fixes #1"),
  ]);
  const [owner, member] = [await as(request, "owner"), await as(request, "member")];
  expect((await owner.post(path, { reference: "1" })).status()).toBe(201);
  const [first, second] = await scan(owner, path);
  const summary = async () => (await (await owner.get(`/projects/${projectId}/requirements`)).json()).find((r: { id: string }) => r.id === id);

  // Pending: no link, not counted, not in what a reviewer sees, and no Evidence complete.
  expect((await (await owner.get(path)).json()).map((e: { number: number }) => e.number)).toEqual([1]);
  expect(await summary()).toMatchObject({ evidenceCount: 1, evidenceComplete: false });
  const reviewed = await (await member.post(`/requirements/${id}/reviews`, { decision: "accepted", version: 1 })).json();
  expect(reviewed.evidence.map((e: { label: string }) => e.label)).toEqual(["#1"]);
  expect((await summary()).review.outdated).toBe(false);

  const confirmed = await member.post(`${path}/suggestions/${first.id}/confirm`);
  expect(confirmed.status()).toBe(201);
  expect(await confirmed.json()).toMatchObject({ number: 2, kind: "pull_request", source: "suggested", linkedBy: "member" });
  expect((await member.post(`${path}/suggestions/${first.id}/confirm`)).status()).toBe(409);
  expect((await member.post(`${path}/suggestions/${first.id}/reject`)).status()).toBe(409);
  expect(await summary()).toMatchObject({ evidenceCount: 2 });
  expect((await summary()).review.outdated).toBe(true);

  expect((await owner.post(`${path}/suggestions/${second.id}/reject`)).status()).toBe(204);
  expect((await owner.post(`${path}/suggestions/${second.id}/confirm`)).status()).toBe(409);
  expect(await (await owner.get(`${path}/suggestions`)).json()).toEqual([]);
  expect((await (await owner.get(path)).json())).toHaveLength(2);

  const history: Event[] = await (await owner.get(`${path}/history`)).json();
  expect(history.map(e => [e.action, e.label, e.actor])).toEqual([["rejected", "#3", "owner"], ["confirmed", "#2", "member"], ["added", "#1", "owner"]]);
  const { rows } = await database.pool.query("SELECT number, status, decided_by, decided_at FROM public.requirement_evidence_suggestions WHERE requirement_id = $1 ORDER BY number", [id]);
  expect(rows.map(r => [r.number, r.status, r.decided_by])).toEqual([[2, "confirmed", "member"], [3, "rejected", "owner"]]);
  expect(rows.every(r => r.decided_at !== null)).toBe(true);

  // A decision stands: neither comes back, though the rejected one can still be linked by hand.
  expect(await scan(owner, path)).toEqual([]);
  expect((await owner.post(path, { reference: "3" })).status()).toBe(201);
});

test("a suggestion follows what GitHub and people do next", async ({ request }) => {
  const { ids: [, otherId], paths: [path], repositoryId } = await setUp(request, [
    item(1, "Guests cannot pay"), pull(2, "By hand", "Closes #1"), pull(3, "Edited later", "Closes #1"), pull(4, "Deleted later", "Closes #1"),
  ]);
  const owner = await as(request, "owner");
  expect((await owner.post(path, { reference: "1" })).status()).toBe(201);
  const found = await scan(owner, path);
  expect(found).toHaveLength(3);

  // Linked by hand: nothing left to decide.
  expect((await owner.post(path, { reference: "2" })).status()).toBe(201);
  expect((await (await owner.get(`${path}/suggestions`)).json()).map((s: Suggestion) => s.number)).toEqual([3, 4]);
  expect((await owner.post(`${path}/suggestions/${found[0].id}/confirm`)).status()).toBe(404);

  // A reference that was edited out goes on the next read, which a refresh also does.
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/items`, { data: { items: [
    item(1, "Guests cannot pay"), pull(2, "By hand", "Closes #1"), pull(3, "Edited later", "No longer related"), pull(5, "Opened later", "Closes #1"),
  ] } });
  expect((await owner.post(`${path}/refresh`)).status()).toBe(200);
  const fresh: Suggestion[] = await (await owner.get(`${path}/suggestions`)).json();
  expect(fresh.map(s => s.number)).toEqual([5]);

  // Gone from GitHub before anyone confirmed it.
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/items`, { data: { items: [item(1, "Guests cannot pay")] } });
  const gone = await owner.post(`${path}/suggestions/${fresh[0].id}/confirm`);
  expect(gone.status()).toBe(409);
  expect((await gone.json()).detail).toContain("GitHub no longer has #5");

  // Another requirement's suggestion can't be decided through this one.
  expect((await owner.post(`/requirements/${otherId}/evidence/suggestions/${fresh[0].id}/reject`)).status()).toBe(404);
});

test("suggestions need a member, an active requirement, a repository, and GitHub", async ({ request }) => {
  const { projectId, paths: [path], repositoryId } = await setUp(request, [item(1, "Guests cannot pay"), pull(2, "Add it", "Closes #1")]);
  const owner = await as(request, "owner");
  expect((await owner.post(path, { reference: "1" })).status()).toBe(201);
  const [found] = await scan(owner, path);

  const outsider = await as(request, "outsider");
  for (const response of [await outsider.get(`${path}/suggestions`), await outsider.post(`${path}/suggestions/scan`),
    await outsider.post(`${path}/suggestions/${found.id}/confirm`), await outsider.post(`${path}/suggestions/${found.id}/reject`)]) {
    expect(response.status()).toBe(404);
  }
  expect((await request.get(`${api.baseURL}${path}/suggestions`)).status()).toBe(401);

  const fault = (data: object) => request.post(`${gitHub}/__github/faults`, { data: { bearer: "installation", path: `^/repositories/${repositoryId}/issues/1/timeline$`, ...data } });
  const clear = () => request.delete(`${gitHub}/__github/faults?bearer=installation`);
  for (const data of [{ status: 500 }, { status: 200, body: { not: "a list" } }, { close: true }]) {
    await fault(data);
    expect((await owner.post(`${path}/suggestions/scan`)).status(), JSON.stringify(data)).toBe(502);
    await clear();
  }
  // Pull requests of another repository that mention the issue are not this repository's.
  await fault({ status: 200, times: 1, body: [{ event: "cross-referenced", source: { type: "issue", issue: {
    number: 9, title: "Elsewhere", state: "open", body: "Closes #1", user: null, html_url: "https://github.com/acme/secret/pull/9",
    repository_url: "https://api.github.com/repos/acme/secret", pull_request: {},
  } } }] });
  expect(await scan(owner, path)).toEqual([]);
  expect((await scan(owner, path)).map(s => s.number)).toEqual([2]);
  const [again] = await (await owner.get(`${path}/suggestions`)).json();

  // A decision waits for a concurrent team write, then sees the project it archived.
  const pending = await withTeamLock(database.pool, projectId, async client => {
    const response = owner.post(`${path}/suggestions/${again.id}/reject`);
    expect(await stillWaiting(response)).toBe(true);
    await client.query("UPDATE public.projects SET archived_at = now() WHERE id = $1", [projectId]);
    return { response };
  });
  expect((await pending.response).status()).toBe(409);
  for (const response of [await owner.post(`${path}/suggestions/scan`), await owner.post(`${path}/suggestions/${again.id}/confirm`)]) {
    expect(response.status()).toBe(409);
  }
  await database.pool.query("UPDATE public.projects SET archived_at = NULL WHERE id = $1", [projectId]);

  // Disconnected: nothing is offered, and nothing can be found.
  await database.pool.query("DELETE FROM public.project_repositories WHERE project_id = $1", [projectId]);
  expect(await (await owner.get(`${path}/suggestions`)).json()).toEqual([]);
  expect((await owner.post(`${path}/suggestions/scan`)).status()).toBe(409);
  expect((await owner.post(`${path}/suggestions/${again.id}/confirm`)).status()).toBe(409);
});

test("a link moves to another requirement in one step, and both histories show it", async ({ request }) => {
  const { projectId, ids: [fromId, toId], paths: [from, to] } = await setUp(request, [
    item(1, "Guests cannot pay"), pull(2, "Add guest checkout", "Closes #1"),
  ]);
  const [owner, member] = [await as(request, "owner"), await as(request, "member")];
  expect((await owner.post(from, { reference: "1" })).status()).toBe(201);
  const link = await (await owner.post(from, { reference: "2" })).json();
  const decided = await (await member.post(`/requirements/${fromId}/reviews`, { decision: "accepted", version: 1 })).json();
  expect(decided.evidence).toHaveLength(2);

  const moved = await member.post(`${from}/${link.id}/move`, { targetRequirementId: toId });
  expect(moved.status()).toBe(200);
  expect(await moved.json()).toMatchObject({ id: link.id, requirementId: toId, number: 2, linkedBy: "member", source: "manual" });
  expect((await (await owner.get(from)).json()).map((e: { number: number }) => e.number)).toEqual([1]);
  expect((await (await owner.get(to)).json()).map((e: { number: number }) => e.number)).toEqual([2]);

  const [left, arrived]: Event[][] = [await (await owner.get(`${from}/history`)).json(), await (await owner.get(`${to}/history`)).json()];
  expect(left[0]).toMatchObject({ action: "moved_out", label: "#2", actor: "member", otherRequirementId: toId, otherRequirementTitle: "Saved carts" });
  expect(arrived).toHaveLength(1);
  expect(arrived[0]).toMatchObject({ action: "moved_in", label: "#2", actor: "member", otherRequirementId: fromId, otherRequirementTitle: "Guest checkout" });

  // The decision on the requirement it left no longer describes its evidence.
  const listed = await (await owner.get(`/projects/${projectId}/requirements`)).json();
  expect(listed.find((r: { id: string }) => r.id === fromId).review.outdated).toBe(true);
  // A person said it doesn't belong there, so it isn't suggested back, even though it closes a linked issue.
  expect(await scan(owner, from)).toEqual([]);

  // It can go back, which is also recorded.
  expect((await owner.post(`${to}/${link.id}/move`, { targetRequirementId: fromId })).status()).toBe(200);
  expect(((await (await owner.get(`${to}/history`)).json()) as Event[]).map(e => e.action)).toEqual(["moved_out", "moved_in"]);
});

test("moves stay within active requirements of the project and never duplicate a link", async ({ request }) => {
  const { projectId, ids: [, toId, archivedId], paths: [from, to] } = await setUp(request, [item(1, "One"), item(2, "Two")], ["From", "To", "Old"]);
  const { ids: [elsewhere] } = await setUp(request, [], ["Other project"]);
  const owner = await as(request, "owner");
  const link = await (await owner.post(from, { reference: "1" })).json();
  expect((await owner.post(to, { reference: "1" })).status()).toBe(201);
  const move = (targetRequirementId: unknown) => owner.post(`${from}/${link.id}/move`, { targetRequirementId });

  for (const [target, message] of [[null, "Choose a requirement."], [link.requirementId, "This link is already on that requirement."],
    [elsewhere, "Choose a requirement in this project."], ["00000000-0000-4000-8000-000000000000", "Choose a requirement in this project."]]) {
    const refused = await move(target);
    expect(refused.status(), String(target)).toBe(400);
    expect((await refused.json()).errors.targetRequirementId).toEqual([message]);
  }
  const duplicate = await move(toId);
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).detail).toBe("#1 is already linked to that requirement.");

  expect((await owner.post(`/requirements/${archivedId}/archive`)).status()).toBe(200);
  expect((await move(archivedId)).status()).toBe(409);
  expect((await (await as(request, "outsider")).post(`${from}/${link.id}/move`, { targetRequirementId: toId })).status()).toBe(404);
  expect((await owner.post(`${from}/00000000-0000-4000-8000-000000000000/move`, { targetRequirementId: toId })).status()).toBe(404);
  expect(await (await owner.get(from)).json()).toHaveLength(1);

  // A full target refuses, and so does an archived project.
  await database.pool.query(`INSERT INTO public.requirement_evidence (requirement_id,kind,repository_id,repository_owner,repository_name,number,state,title,url,github_created_at,github_updated_at,linked_by)
    SELECT $1,'issue',1,'acme','other',n,'open','t','https://github.com/acme/other/issues/1',now(),now(),'owner' FROM generate_series(100,148) n`, [toId]);
  const full = await (await owner.post(from, { reference: "2" })).json();
  const refused = await owner.post(`${from}/${full.id}/move`, { targetRequirementId: toId });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).detail).toBe("A requirement can have at most 50 evidence links.");
  await database.pool.query("UPDATE public.projects SET archived_at = now() WHERE id = $1", [projectId]);
  expect((await owner.post(`${from}/${full.id}/move`, { targetRequirementId: toId })).status()).toBe(409);
});

test("a moved change is compared with the releases it joins, and a moved release with the changes it joins", async ({ request }) => {
  const [merged, tagged] = ["abc1234".padEnd(40, "0"), "1111111".padEnd(40, "0")];
  const { ids: [, toId], paths: [from, to], repositoryId } = await setUp(request, [pull(9, "Add checkout", "", { merged: true, state: "closed", merge_sha: merged } as Partial<Item>)]);
  await request.put(`${gitHub}/__github/repositories/${repositoryId}/releases`, { data: { releases: [{ tag: "v1", published_at: "2026-09-25T10:00:00Z", sha: tagged, contains: [merged] }] } });
  const owner = await as(request, "owner");
  const change = await (await owner.post(from, { reference: "9" })).json();
  const release = await (await owner.post(to, { reference: "v1" })).json();
  const contains = async (path: string) => (await (await owner.get(path)).json()).find((e: { kind: string }) => e.kind === "release").contains;
  expect(await contains(to)).toEqual({});

  expect((await owner.post(`${from}/${change.id}/move`, { targetRequirementId: toId })).status()).toBe(200);
  expect(await contains(to)).toEqual({ [change.id]: true });

  // Back apart, then the release follows the change and is compared afresh.
  const fromId = from.split("/")[2];
  expect((await owner.post(`${to}/${change.id}/move`, { targetRequirementId: fromId })).status()).toBe(200);
  expect((await owner.post(`${to}/${release.id}/move`, { targetRequirementId: fromId })).status()).toBe(200);
  expect(await contains(from)).toEqual({ [change.id]: true });
});

test("a scan saves nothing if the linked issues changed while GitHub was read, and a truncated read drops nothing", async ({ request }) => {
  const { projectId, ids: [id], paths: [path], repositoryId } = await setUp(request, [item(1, "Guests cannot pay"), pull(2, "Add it", "Closes #1")]);
  const owner = await as(request, "owner");
  expect((await owner.post(path, { reference: "1" })).status()).toBe(201);

  const pending = await withTeamLock(database.pool, projectId, async client => {
    const response = owner.post(`${path}/suggestions/scan`);
    expect(await stillWaiting(response)).toBe(true);
    await client.query("DELETE FROM public.requirement_evidence WHERE requirement_id = $1", [id]);
    return { response };
  });
  expect((await pending.response).status()).toBe(409);
  expect(await (await owner.get(`${path}/suggestions`)).json()).toEqual([]);

  expect((await owner.post(path, { reference: "1" })).status()).toBe(201);
  expect(await scan(owner, path)).toHaveLength(1);
  // Every page full and the reference not among them: GitHub stopped being read, not referencing it.
  const full = Array.from({ length: 100 }, () => ({ event: "labeled" }));
  const timeline = `^/repositories/${repositoryId}/issues/1/timeline$`;
  await request.post(`${gitHub}/__github/faults`, { data: { bearer: "installation", path: timeline, status: 200, body: full } });
  expect(await scan(owner, path)).toHaveLength(1);
  await request.delete(`${gitHub}/__github/faults?bearer=installation`);
  // A complete read without it still drops it.
  await request.post(`${gitHub}/__github/faults`, { data: { bearer: "installation", path: timeline, status: 200, times: 1, body: [] } });
  expect(await scan(owner, path)).toEqual([]);
});

test("a move refuses without a repository, or when the link or the target changed while it waited, and keeps earlier decisions", async ({ request }) => {
  const { projectId, ids: [fromId, toId, thirdId], paths: [from, to] } = await setUp(request,
    [item(1, "Guests cannot pay"), pull(2, "Add it", "Closes #1"), item(3, "Other")], ["From", "To", "Third"]);
  const [owner, member] = [await as(request, "owner"), await as(request, "member")];
  expect((await owner.post(from, { reference: "1" })).status()).toBe(201);
  const [suggestion] = await scan(owner, from);
  const link = await (await member.post(`${from}/suggestions/${suggestion.id}/confirm`)).json();
  const body = { targetRequirementId: toId };
  const history = async (id: string) => (await database.pool.query("SELECT count(*)::int AS count FROM public.requirement_evidence_events WHERE requirement_id = $1", [id])).rows[0].count;
  const [fromEvents, toEvents] = [await history(fromId), await history(toId)];

  // Moved elsewhere while this move waited: it is not moved again, and no history is written.
  const moved = await withTeamLock(database.pool, projectId, async client => {
    const response = owner.post(`${from}/${link.id}/move`, body);
    expect(await stillWaiting(response)).toBe(true);
    await client.query("UPDATE public.requirement_evidence SET requirement_id = $1 WHERE id = $2", [thirdId, link.id]);
    return { response };
  });
  expect((await moved.response).status()).toBe(409);
  expect((await database.pool.query("SELECT requirement_id FROM public.requirement_evidence WHERE id = $1", [link.id])).rows[0].requirement_id).toBe(thirdId);
  expect([await history(fromId), await history(toId)]).toEqual([fromEvents, toEvents]);
  await database.pool.query("UPDATE public.requirement_evidence SET requirement_id = $1 WHERE id = $2", [fromId, link.id]);

  // The target's links changed while this move waited: what was compared is out of date.
  const added = await (await owner.post(to, { reference: "3" })).json();
  const changed = await withTeamLock(database.pool, projectId, async client => {
    const response = owner.post(`${from}/${link.id}/move`, body);
    expect(await stillWaiting(response)).toBe(true);
    await client.query("DELETE FROM public.requirement_evidence WHERE id = $1", [added.id]);
    return { response };
  });
  expect((await changed.response).status()).toBe(409);

  // The decision made on the suggestion stays as it was, and still keeps it from coming back.
  expect((await owner.post(`${from}/${link.id}/move`, body)).status()).toBe(200);
  const { rows: [row] } = await database.pool.query("SELECT status, decided_by FROM public.requirement_evidence_suggestions WHERE id = $1", [suggestion.id]);
  expect(row).toEqual({ status: "confirmed", decided_by: "member" });
  expect(await scan(owner, from)).toEqual([]);

  await database.pool.query("DELETE FROM public.project_repositories WHERE project_id = $1", [projectId]);
  const refused = await owner.post(`${to}/${link.id}/move`, { targetRequirementId: fromId });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).detail).toBe("Connect a GitHub repository to this project first.");
  expect((await database.pool.query("SELECT requirement_id FROM public.requirement_evidence WHERE id = $1", [link.id])).rows[0].requirement_id).toBe(toId);
});

test("the migration protects suggestions, constrains them and the history, and its rollback keeps what the old history can hold", async ({ request }) => {
  const { ids: [fromId, toId], paths: [from] } = await setUp(request, [item(1, "One"), pull(2, "Two", "Closes #1"), pull(3, "Three", "Closes #1")]);
  const owner = await as(request, "owner");
  expect((await owner.post(from, { reference: "1" })).status()).toBe(201);
  const [confirm, reject] = await scan(owner, from);
  expect((await owner.post(`${from}/suggestions/${confirm.id}/confirm`)).status()).toBe(201);
  expect((await owner.post(`${from}/suggestions/${reject.id}/reject`)).status()).toBe(204);
  const [link] = await (await owner.get(from)).json();
  expect((await owner.post(`${from}/${link.id}/move`, { targetRequirementId: toId })).status()).toBe(200);

  const count = async (sql: string, values: unknown[] = []) => (await database.pool.query(sql, values)).rows[0].count;
  const table = "requirement_evidence_suggestions";
  expect(await count(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='${table}' AND rowsecurity`)).toBe(1);
  expect(await count(`SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_name='${table}' AND grantee IN ('anon','authenticated','PUBLIC')`)).toBe(0);
  const insert = (values: Record<string, unknown>) => {
    const row = { requirement_id: fromId, repository_id: 1, number: 900, title: "t", state: "open", url: "https://github.com/a/b/pull/1", reference: "Closes #1", ...values };
    const names = Object.keys(row);
    return database.pool.query(`INSERT INTO public.${table} (${names.join(",")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
  };
  await insert({});
  await expect(insert({})).rejects.toThrow(/duplicate key/);
  for (const values of [{ status: "maybe" }, { state: "draft" }, { number: 0 }, { status: "confirmed" }, { decided_by: "owner" }, { title: null }]) {
    await expect(insert({ number: 901, ...values }), JSON.stringify(values)).rejects.toThrow(/check constraint|not-null/);
  }
  await expect(insert({ number: 902, status: "rejected", decided_by: "nobody", decided_at: new Date() })).rejects.toThrow(/foreign key/);
  await expect(database.pool.query(`INSERT INTO public.requirement_evidence_events (requirement_id,evidence_id,action,kind,label,title,actor)
    VALUES ($1,gen_random_uuid(),'moved_in','issue','#1','t','owner')`, [fromId])).rejects.toThrow(/check constraint/);

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  const links = await count("SELECT count(*)::int AS count FROM public.requirement_evidence");
  await database.pool.query(await readFile("docs/schema/requirement-evidence-suggestions-rollback.sql", "utf8"));
  expect(await count(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='${table}'`)).toBe(0);
  expect(await count("SELECT count(*)::int AS count FROM public.requirement_evidence")).toBe(links);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);
  // A move stays as a removal and an addition, a confirmation as an addition; a rejection has no earlier form.
  const actions = async (id: string) => (await database.pool.query("SELECT action FROM public.requirement_evidence_events WHERE requirement_id = $1 ORDER BY occurred_at, action", [id])).rows.map(r => r.action);
  expect(await actions(fromId)).toEqual(["added", "added", "removed"]);
  expect(await actions(toId)).toEqual(["added"]);
});
