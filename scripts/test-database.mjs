import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Pool } from "pg";

const run = promisify(execFile);

export async function startTestDatabase() {
  const name = `specthread-auth-${randomUUID()}`;
  const password = randomBytes(24).toString("hex");
  let pool;
  let started = false;
  const stop = async () => {
    await pool?.end();
    if (started) {
      await run("docker", ["stop", name], { timeout: 30_000 });
      started = false;
    }
  };
  try {
    // Verify the EF context before any database execution. No live credentials.
    await run("dotnet", ["ef", "dbcontext", "info", "--project", "app/api", "--configuration", "Release", "--no-build", "--json"], {
      env: { ...process.env, DOTNET_ENVIRONMENT: "Production", ConnectionStrings__Database: "Host=127.0.0.1;Port=1;Database=offline;Username=placeholder;Password=placeholder" },
    });
    await run("docker", ["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_PASSWORD", "postgres:17"], {
      env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 150_000,
    });
    started = true;
    const { stdout } = await run("docker", ["port", name, "5432/tcp"]);
    const port = Number(stdout.trim().split(":").at(-1));
    if (!Number.isInteger(port) || port < 1) throw new Error("Invalid test database port");
    const connectionString = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
    pool = new Pool({ connectionString, connectionTimeoutMillis: 1000 });
    for (let attempt = 0; ; attempt++) {
      try { await pool.query("SELECT 1"); break; }
      catch (error) {
        if (attempt === 59) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    const readSql = async (path) => (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
    await pool.query("CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;");
    await pool.query(await readSql("docs/schema/initial.sql"));
    await pool.query(await readSql("docs/schema/auth-rate-limits.sql"));
    return { name, connectionString, pool, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
