import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// Requirements citing project documents (ADR-049) against a disposable PostgreSQL database,
// with tokens from the test JWKS issuer that Playwright starts for every run.
const issuer = "http://127.0.0.1:5101";
const pdf = Buffer.from("%PDF-1.4\n% SpecThread test document\n");
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let api: Awaited<ReturnType<typeof startApi>>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  database = await startTestDatabase();
  await database.pool.query(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES
    ('owner','Owner','owner@example.invalid',true,now(),now()),
    ('member','Member','member@example.invalid',true,now(),now()),
    ('outsider','Outsider','outsider@example.invalid',true,now(),now())`);
  await database.pool.query(`INSERT INTO user_onboarding (user_id,completed_at) SELECT id,now() FROM public."user"`);
  const url = new URL(database.connectionString);
  const connection = `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`;
  api = await startApi(5120, { ConnectionStrings__Database: connection, Auth__Issuer: issuer });
});
test.afterAll(async () => {
  api?.stop();
  await database?.stop();
});

type Linked = { id: string; title: string; archivedAt: string | null; linkedBy: string; linkedAt: string };

async function as(request: APIRequestContext, sub: string) {
  const minted = await request.post(`${issuer}/sign`, { data: { claims: { sub } } });
  expect(minted.status()).toBe(200);
  const headers = { authorization: `Bearer ${(await minted.json()).token}` };
  const url = (path: string) => `${api.baseURL}${path}`;
  return {
    get: (path: string) => request.get(url(path), { headers }),
    post: (path: string, data?: object) => request.post(url(path), { headers, data }),
    put: (path: string, data: object) => request.put(url(path), { headers, data }),
    upload: async (projectId: string, title: string) => {
      const response = await request.post(url(`/projects/${projectId}/documents`), {
        headers, multipart: { file: { name: `${title}.pdf`, mimeType: "application/pdf", buffer: pdf }, title },
      });
      expect(response.status()).toBe(201);
      return (await response.json()).id as string;
    },
  };
}

// A project in a new team owned by "owner", where "member" is a plain Member.
async function createProject(request: APIRequestContext, name: string) {
  const owner = await as(request, "owner");
  const team = await owner.post("/teams", { name: `${name} team` });
  expect(team.status()).toBe(201);
  const teamId: string = (await team.json()).id;
  // Fixture-only membership. Product joins require invitation acceptance.
  await database.pool.query("INSERT INTO team_members(team_id,user_id,role) VALUES ($1,'member','member')", [teamId]);
  const response = await owner.post("/projects", { name, teamId });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
}

const titles = (documents: Linked[]) => documents.map(document => document.title);

test("members link documents when creating a requirement and replace them when saving it", async ({ request }) => {
  const projectId = await createProject(request, "Box");
  const owner = await as(request, "owner");
  const member = await as(request, "member");
  const brief = await owner.upload(projectId, "Design the Box");
  const spec = await owner.upload(projectId, "Box spec");
  const notes = await member.upload(projectId, "Client notes");

  const created = await owner.post(`/projects/${projectId}/requirements`, {
    title: "Box opens", acceptanceCriteria: ["The lid lifts"], documentIds: [spec, brief],
  });
  expect(created.status()).toBe(201);
  const requirement = await created.json();
  // Listed by title, each with who linked it and when.
  expect(titles(requirement.documents)).toEqual(["Box spec", "Design the Box"]);
  expect(requirement.documents[0]).toMatchObject({ id: spec, fileName: "Box spec.pdf", contentType: "application/pdf", archivedAt: null, linkedBy: "owner" });
  const briefLinkedAt = requirement.documents[1].linkedAt;

  const saved = await member.put(`/requirements/${requirement.id}`, {
    title: "Box opens", acceptanceCriteria: ["The lid lifts"], documentIds: [brief, notes], version: 1,
  });
  expect(saved.status()).toBe(200);
  const fetched = await (await owner.get(`/requirements/${requirement.id}`)).json();
  expect(fetched.version).toBe(2);
  expect(titles(fetched.documents)).toEqual(["Client notes", "Design the Box"]);
  // A link that was kept keeps who made it and when; a new one records the member who added it.
  expect(fetched.documents.find((d: Linked) => d.id === brief)).toMatchObject({ linkedBy: "owner", linkedAt: briefLinkedAt });
  expect(fetched.documents.find((d: Linked) => d.id === notes)).toMatchObject({ linkedBy: "member" });

  const cleared = await member.put(`/requirements/${requirement.id}`, { title: "Box opens", acceptanceCriteria: ["The lid lifts"], version: 2 });
  expect((await cleared.json()).documents).toEqual([]);
  const { rows } = await database.pool.query("SELECT count(*)::int AS count FROM requirement_documents WHERE requirement_id=$1", [requirement.id]);
  expect(rows[0].count).toBe(0);
  // Unlinking leaves the documents themselves in the project.
  expect(await (await owner.get(`/projects/${projectId}/documents`)).json()).toHaveLength(3);
});

test("only this project's documents, each once and at most twenty, can be linked", async ({ request }) => {
  const projectId = await createProject(request, "Limits");
  const otherProject = await createProject(request, "Elsewhere");
  const owner = await as(request, "owner");
  const own = await owner.upload(projectId, "Own");
  const foreign = await owner.upload(otherProject, "Foreign");
  const create = (documentIds: unknown) =>
    owner.post(`/projects/${projectId}/requirements`, { title: "Linked", acceptanceCriteria: ["Done"], documentIds });

  for (const [documentIds, message] of [
    [[foreign], "Choose documents from this project's Documentation tab."],
    [["00000000-0000-0000-0000-000000000000"], "Choose documents from this project's Documentation tab."],
    [[own, own], "Link each document once."],
    [Array.from({ length: 21 }, () => crypto.randomUUID()), "Link at most 20 documents."],
  ] as const) {
    const refused = await create(documentIds);
    expect(refused.status(), message).toBe(400);
    expect((await refused.json()).errors).toEqual({ documentIds: [message] });
  }
  expect(await (await owner.get(`/projects/${projectId}/requirements`)).json()).toEqual([]);
  expect((await create([own])).status()).toBe(201);
});

test("an archived document can't be newly linked, but stays linked through later saves", async ({ request }) => {
  const projectId = await createProject(request, "Archive");
  const owner = await as(request, "owner");
  const kept = await owner.upload(projectId, "Kept");
  const retired = await owner.upload(projectId, "Retired");
  const requirement = await (await owner.post(`/projects/${projectId}/requirements`, {
    title: "Uses kept", acceptanceCriteria: ["Done"], documentIds: [kept],
  })).json();

  expect((await owner.post(`/documents/${kept}/archive`)).status()).toBe(200);
  expect((await owner.post(`/documents/${retired}/archive`)).status()).toBe(200);
  const shown = await (await owner.get(`/requirements/${requirement.id}`)).json();
  expect(shown.documents).toEqual([expect.objectContaining({ id: kept, archivedAt: expect.any(String) })]);

  const save = (documentIds: string[], version: number) =>
    owner.put(`/requirements/${requirement.id}`, { title: "Uses kept", acceptanceCriteria: ["Done"], documentIds, version });
  const newly = await save([kept, retired], 1);
  expect(newly.status()).toBe(400);
  expect((await newly.json()).errors).toEqual({ documentIds: ["An archived document can't be newly linked."] });
  const again = await save([kept], 1);
  expect(again.status()).toBe(200);
  expect(titles((await again.json()).documents)).toEqual(["Kept"]);
  expect((await owner.post(`/projects/${projectId}/requirements`, {
    title: "Wants retired", acceptanceCriteria: ["Done"], documentIds: [retired],
  })).status()).toBe(400);
});

test("people outside the team can't link documents or see a requirement's links", async ({ request }) => {
  const projectId = await createProject(request, "Private");
  const owner = await as(request, "owner");
  const outsider = await as(request, "outsider");
  const document = await owner.upload(projectId, "Private brief");
  const requirement = await (await owner.post(`/projects/${projectId}/requirements`, {
    title: "Private", acceptanceCriteria: ["Done"], documentIds: [document],
  })).json();
  for (const response of [
    await outsider.post(`/projects/${projectId}/requirements`, { title: "Sneaky", acceptanceCriteria: ["Done"], documentIds: [document] }),
    await outsider.get(`/requirements/${requirement.id}`),
    await outsider.put(`/requirements/${requirement.id}`, { title: "Sneaky", acceptanceCriteria: ["Done"], documentIds: [], version: 1 }),
  ]) expect(response.status()).toBe(404);
  expect((await (await owner.get(`/requirements/${requirement.id}`)).json()).documents).toHaveLength(1);
});

test("the migration protects the link table, and its rollback removes only that table", async ({ request }) => {
  const projectId = await createProject(request, "Schema");
  const owner = await as(request, "owner");
  const document = await owner.upload(projectId, "Schema brief");
  const requirement = await (await owner.post(`/projects/${projectId}/requirements`, {
    title: "Schema", acceptanceCriteria: ["Done"], documentIds: [document],
  })).json();
  const count = async (text: string) => (await database.pool.query(text)).rows[0].count as number;

  await expect(database.pool.query(`INSERT INTO requirement_documents (requirement_id,document_id,linked_by)
    VALUES ('${requirement.id}','${document}','owner')`)).rejects.toThrow(/duplicate key/);
  await expect(database.pool.query(`INSERT INTO requirement_documents (requirement_id,document_id,linked_by)
    VALUES ('${requirement.id}','00000000-0000-0000-0000-000000000000','owner')`)).rejects.toThrow(/foreign key/);
  await expect(database.pool.query(`DELETE FROM public.documents WHERE id='${document}'`)).rejects.toThrow(/foreign key/);

  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_documents' AND rowsecurity")).toBe(1);
  // A dedicated connection, so the role change never leaks into the pool.
  const client = await database.pool.connect();
  try {
    for (const role of ["anon", "authenticated"]) {
      await client.query(`SET ROLE ${role}`);
      await expect(client.query("SELECT * FROM public.requirement_documents")).rejects.toThrow(/permission denied/);
      await client.query("RESET ROLE");
    }
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }

  const history = await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`);
  await database.pool.query((await readFile("docs/schema/requirement-documents-rollback.sql", "utf8")).replace(/^﻿/, ""));
  expect(await count("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND tablename='requirement_documents'")).toBe(0);
  expect(await count(`SELECT count(*)::int AS count FROM public.requirements WHERE id='${requirement.id}'`)).toBe(1);
  expect(await count(`SELECT count(*)::int AS count FROM public.documents WHERE id='${document}'`)).toBe(1);
  expect(await count(`SELECT count(*)::int AS count FROM "__EFMigrationsHistory"`)).toBe(history - 1);
});
