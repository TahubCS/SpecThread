import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";

// Windows may terminate the web-server process tree without delivering SIGTERM.
export default async function teardown() {
  const path = "playwright/.cache/test-web-database.json";
  let record;
  try { record = JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!/^specthread-auth-[0-9a-f-]{36}$/.test(record.name)) throw new Error("Invalid test container name");
  await promisify(execFile)("docker", ["stop", record.name], { timeout: 30_000 });
  await unlink(path);
}
