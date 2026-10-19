import { expect, test, type APIRequestContext } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { startApi } from "../support/api-process";

// Project documents (ADR-047) against a disposable PostgreSQL database, with tokens from
// the test JWKS issuer that Playwright starts for every run (scripts/start-test-jwks.mjs).
const issuer = "http://127.0.0.1:5101";
const MAX_BYTES = 4 * 1024 * 1024;
const pdf = Buffer.from("%PDF-1.4\n% SpecThread test document\n");
const doc = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(32)]);
const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32)]);
const types = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
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
  api = await startApi(5119, { ConnectionStrings__Database: connection, Auth__Issuer: issuer });
});
test.afterAll(async () => {
  api?.stop();
  await database?.stop();
});

type Upload = { name: string; buffer: Buffer; mimeType?: string; title?: string };

async function as(request: APIRequestContext, sub: string) {
  const minted = await request.post(`${issuer}/sign`, { data: { claims: { sub } } });
  expect(minted.status()).toBe(200);
  const headers = { authorization: `Bearer ${(await minted.json()).token}` };
  const url = (path: string) => `${api.baseURL}${path}`;
  return {
    get: (path: string) => request.get(url(path), { headers }),
    post: (path: string, data?: object) => request.post(url(path), { headers, data }),
    upload: (projectId: string, { name, buffer, mimeType = "application/octet-stream", title }: Upload) =>
      request.post(url(`/projects/${projectId}/documents`), {
        headers,
        multipart: { file: { name, mimeType, buffer }, ...(title === undefined ? {} : { title }) },
      }),
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
  return await response.json() as { id: string };
}

test("members upload, list, download, and archive PDF, DOC, and DOCX documents", async ({ request }) => {
  const project = await createProject(request, "Documents");
  const owner = await as(request, "owner");
  const member = await as(request, "member");

  const uploaded = await member.upload(project.id, { name: "brief.pdf", buffer: pdf, title: "  Product brief  " });
  expect(uploaded.status()).toBe(201);
  const brief = await uploaded.json();
  expect(brief).toMatchObject({
    projectId: project.id, title: "Product brief", fileName: "brief.pdf", contentType: types.pdf,
    sizeBytes: pdf.length, uploadedBy: "member", uploadedByName: "Member", archivedAt: null,
  });
  expect(uploaded.headers().location).toBe(`/documents/${brief.id}`);

  // The stored type follows the validated extension, not the client's header; the title defaults to the name.
  const plan = await (await owner.upload(project.id, { name: "plan.docx", buffer: docx, mimeType: "text/html" })).json();
  expect(plan).toMatchObject({ title: "plan", contentType: types.docx, uploadedByName: "Owner" });
  const notes = await (await owner.upload(project.id, { name: "C:\\fakepath\\Notes.DOC", buffer: doc })).json();
  expect(notes).toMatchObject({ title: "Notes", fileName: "Notes.DOC", contentType: types.doc });

  const listed = await (await owner.get(`/projects/${project.id}/documents`)).json();
  expect(listed.map((d: { id: string }) => d.id)).toEqual([notes.id, plan.id, brief.id]);

  const download = await owner.get(`/documents/${brief.id}/content`);
  expect(download.status()).toBe(200);
  expect(Buffer.compare(await download.body(), pdf)).toBe(0);
  expect(download.headers()["content-type"]).toBe(types.pdf);
  expect(download.headers()["content-disposition"]).toMatch(/^attachment; filename=brief\.pdf/);
  expect(download.headers()["x-content-type-options"]).toBe("nosniff");
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect(await (await member.get(`/documents/${plan.id}`)).json()).toEqual(plan);

  const archived = await (await member.post(`/documents/${brief.id}/archive`)).json();
  expect(archived.archivedAt).not.toBeNull();
  const again = await (await member.post(`/documents/${brief.id}/archive`)).json();
  expect(again.archivedAt).toBe(archived.archivedAt);
  const remaining = await (await owner.get(`/projects/${project.id}/documents`)).json();
  expect(remaining.map((d: { id: string }) => d.id)).toEqual([notes.id, plan.id]);
  expect((await owner.get(`/documents/${brief.id}`)).status()).toBe(200);
  expect((await owner.get(`/documents/${brief.id}/content`)).status()).toBe(200);
});

test("uploads are checked for type, contents, size, and title", async ({ request }) => {
  const project = await createProject(request, "Validation");
  const member = await as(request, "member");
  const fileError = async (upload: Upload) => {
    const response = await member.upload(project.id, upload);
    expect(response.status(), upload.name).toBe(400);
    return (await response.json()).errors.file?.[0];
  };

  expect(await fileError({ name: "notes.txt", buffer: Buffer.from("plain text") })).toBe("Upload a PDF, DOC, or DOCX file.");
  expect(await fileError({ name: "fake.pdf", buffer: Buffer.from("<html>not a pdf</html>") }))
    .toBe("The file's contents don't match its type.");
  expect(await fileError({ name: "fake.docx", buffer: pdf })).toBe("The file's contents don't match its type.");
  expect(await fileError({ name: "empty.pdf", buffer: Buffer.alloc(0) })).toBe("Choose a file to upload.");
  const tooLarge = Buffer.concat([pdf, Buffer.alloc(MAX_BYTES + 1 - pdf.length)]);
  expect(await fileError({ name: "large.pdf", buffer: tooLarge })).toBe("Use a file of at most 4 MB.");
  // Bodies well past the limit are refused by the request size limit before validation.
  const farTooLarge = Buffer.concat([pdf, Buffer.alloc(MAX_BYTES + 256 * 1024)]);
  expect((await member.upload(project.id, { name: "huge.pdf", buffer: farTooLarge })).status()).toBe(413);

  const longTitle = await member.upload(project.id, { name: "brief.pdf", buffer: pdf, title: "x".repeat(201) });
  expect(longTitle.status()).toBe(400);
  expect((await longTitle.json()).errors.title).toEqual(["Use at most 200 characters."]);

  const atLimit = Buffer.concat([pdf, Buffer.alloc(MAX_BYTES - pdf.length)]);
  expect((await member.upload(project.id, { name: "limit.pdf", buffer: atLimit })).status()).toBe(201);
  const { rows } = await database.pool.query("SELECT count(*)::int AS count FROM public.documents WHERE project_id = $1", [project.id]);
  expect(rows).toEqual([{ count: 1 }]);
});

test("non-members see nothing, and archived projects keep documents readable but frozen", async ({ request }) => {
  const project = await createProject(request, "Access");
  const owner = await as(request, "owner");
  const member = await as(request, "member");
  const outsider = await as(request, "outsider");
  const brief = await (await member.upload(project.id, { name: "brief.pdf", buffer: pdf })).json();

  for (const response of [
    await outsider.get(`/projects/${project.id}/documents`),
    await outsider.upload(project.id, { name: "brief.pdf", buffer: pdf }),
    await outsider.get(`/documents/${brief.id}`),
    await outsider.get(`/documents/${brief.id}/content`),
    await outsider.post(`/documents/${brief.id}/archive`),
  ]) expect(response.status()).toBe(404);

  expect((await owner.post(`/projects/${project.id}/archive`)).status()).toBe(200);
  expect((await member.upload(project.id, { name: "late.pdf", buffer: pdf })).status()).toBe(409);
  expect((await member.post(`/documents/${brief.id}/archive`)).status()).toBe(409);
  expect((await member.get(`/projects/${project.id}/documents`)).status()).toBe(200);
  expect((await member.get(`/documents/${brief.id}/content`)).status()).toBe(200);
});

test("the database constrains document metadata and protects both tables", async ({ request }) => {
  const project = await createProject(request, "Constraints");
  const sql = (text: string) => database.pool.query(text);
  const insert = (contentType: string, size: number) => sql(`INSERT INTO public.documents
    (project_id,title,file_name,content_type,size_bytes,uploaded_by)
    VALUES ('${project.id}','Title','file.pdf','${contentType}',${size},'owner')`);

  await expect(insert("text/html", 10)).rejects.toThrow(/check constraint/);
  await expect(insert(types.pdf, 0)).rejects.toThrow(/check constraint/);
  await expect(insert(types.pdf, MAX_BYTES + 1)).rejects.toThrow(/check constraint/);
  await expect(sql(`INSERT INTO public.document_contents (document_id,content)
    VALUES ('00000000-0000-0000-0000-000000000000','\\x00')`)).rejects.toThrow(/foreign key/);

  const { rows } = await sql("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('documents','document_contents') ORDER BY tablename");
  expect(rows).toEqual([{ tablename: "document_contents", rowsecurity: true }, { tablename: "documents", rowsecurity: true }]);
  // A dedicated connection, so the role change never leaks into the pool.
  const client = await database.pool.connect();
  try {
    for (const role of ["anon", "authenticated"]) {
      await client.query(`SET ROLE ${role}`);
      for (const table of ["documents", "document_contents"]) {
        await expect(client.query(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/);
      }
      await client.query("RESET ROLE");
    }
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
});
