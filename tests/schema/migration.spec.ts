import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { getAuthTables } from "better-auth/db";
import { jwt } from "better-auth/plugins";

const run = promisify(execFile);
const container = `specthread-schema-${randomUUID()}`;
const project = "11111111-1111-4111-8111-111111111111";
const requirement = "22222222-2222-4222-8222-222222222222";
let started = false;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function sql(statement: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = execFile("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
      (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim()));
    process.stdin?.end(statement);
  });
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  test.setTimeout(180_000);
  // No published ports or mounted volumes; trust applies only inside this disposable container.
  await run("docker", ["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"], { timeout: 150_000 });
  started = true;
  for (let attempt = 0; ; attempt++) {
    try {
      await run("docker", ["exec", container, "pg_isready", "-U", "postgres"]);
      break;
    } catch (error) {
      if (attempt === 59) throw error;
      await sleep(500);
    }
  }
  let stableReadyChecks = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      if (await sql("SELECT 1;") !== "1") throw new Error("postgres readiness probe returned unexpected output");
      stableReadyChecks++;
      if (stableReadyChecks === 3) break;
      await sleep(250);
    } catch (error) {
      stableReadyChecks = 0;
      if (attempt === 59) throw error;
      await sleep(500);
    }
  }
  // Emulate potentially permissive Supabase defaults, then prove the migration revokes them.
  await sql("CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;");
  await sql(await readFile("docs/schema/initial.sql", "utf8"));
  await sql(`INSERT INTO public."user" (id,name,email,"createdAt","updatedAt") VALUES ('owner','Owner','owner@example.invalid',now(),now());
    INSERT INTO public.projects (id,name,owner_user_id) VALUES ('${project}','Example','owner');
    INSERT INTO public.project_members (project_id,user_id) VALUES ('${project}','owner');
    INSERT INTO public.requirements (id,project_id,title,description,created_by) VALUES ('${requirement}','${project}','First requirement','','owner');`);
});

test.afterAll(async () => {
  if (started) await run("docker", ["stop", container]);
});

test("auth columns match the pinned Better Auth core and JWT schema", async () => {
  const contract = getAuthTables({ plugins: [jwt()] });
  for (const [key, table] of Object.entries(contract)) {
    const name = table.modelName ?? key;
    const columns: { column_name: string; data_type: string; is_nullable: string }[] = JSON.parse(await sql(
      `SELECT json_agg(c) FROM (SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='${name}') c;`,
    ));
    expect(columns).toHaveLength(Object.keys(table.fields).length + 1);
    expect(columns.find(c => c.column_name === "id")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    for (const [fieldName, field] of Object.entries(table.fields)) {
      const type = field.type === "date" ? "timestamp with time zone" : field.type === "boolean" ? "boolean" : "text";
      expect(columns.find(c => c.column_name === (field.fieldName ?? fieldName))).toMatchObject({
        data_type: type, is_nullable: field.required ? "NO" : "YES",
      });
    }
  }
});

test("RLS and revoked browser grants protect all nine tables", async () => {
  expect(await sql("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> '__EFMigrationsHistory' AND rowsecurity;")).toBe("9");
  expect(await sql("SELECT count(*) FROM pg_policies WHERE schemaname='public';")).toBe("0");
  for (const role of ["anon", "authenticated"]) {
    await expect(sql(`SET ROLE ${role}; SELECT * FROM public.jwks;`)).rejects.toThrow(/permission denied/);
    await expect(sql(`SET ROLE ${role}; SELECT * FROM public.requirements;`)).rejects.toThrow(/permission denied/);
  }
  // Even if a future grant is accidentally added, no-policy RLS denies rows.
  expect(await sql("BEGIN; GRANT SELECT ON public.requirements TO authenticated; SET LOCAL ROLE authenticated; SELECT count(*) FROM public.requirements; ROLLBACK;")).toBe("0");
});

test("duplicate membership and invalid references are rejected", async () => {
  await expect(sql(`INSERT INTO project_members (project_id,user_id) VALUES ('${project}','owner');`)).rejects.toThrow(/duplicate key/);
  await expect(sql(`INSERT INTO project_members (project_id,user_id) VALUES ('${project}','missing-user');`)).rejects.toThrow(/foreign key/);
  await expect(sql("DELETE FROM public.\"user\" WHERE id='owner';")).rejects.toThrow(/foreign key/);
  await expect(sql(`DELETE FROM projects WHERE id='${project}';`)).rejects.toThrow(/foreign key/);
});

test("criteria order and required content are constrained", async () => {
  await sql(`INSERT INTO acceptance_criteria (requirement_id,text,position) VALUES ('${requirement}','A verifiable outcome',0);`);
  await expect(sql(`INSERT INTO acceptance_criteria (requirement_id,text,position) VALUES ('${requirement}','Duplicate position',0);`)).rejects.toThrow(/duplicate key/);
  await expect(sql(`INSERT INTO acceptance_criteria (requirement_id,text,position) VALUES ('${requirement}','Negative position',-1);`)).rejects.toThrow(/check constraint/);
  await expect(sql(`UPDATE requirements SET title='   ' WHERE id='${requirement}';`)).rejects.toThrow(/check constraint/);
  await expect(sql(`UPDATE requirements SET version=0 WHERE id='${requirement}';`)).rejects.toThrow(/check constraint/);
});

test("versioned updates detect stale writes and archives preserve rows", async () => {
  expect(await sql(`UPDATE requirements SET version=version+1,updated_at=now() WHERE id='${requirement}' AND version=1 RETURNING version;`)).toBe("2");
  expect(await sql(`UPDATE requirements SET title='Stale write' WHERE id='${requirement}' AND version=1 RETURNING id;`)).toBe("");
  await sql(`UPDATE requirements SET archived_at=now() WHERE id='${requirement}';`);
  expect(await sql(`SELECT count(*) FROM acceptance_criteria WHERE requirement_id='${requirement}';`)).toBe("1");
});

test("rollback removes the nine application tables and migration record", async () => {
  await sql(await readFile("docs/schema/rollback.sql", "utf8"));
  expect(await sql("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> '__EFMigrationsHistory';")).toBe("0");
  expect(await sql('SELECT count(*) FROM "__EFMigrationsHistory";')).toBe("0");
});
