import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { startTestDatabase } from "./test-database.mjs";

if (!existsSync("app/api/bin/Release/net10.0/SpecThread.Api.dll")) {
  execFileSync("dotnet", ["build", "app/api", "--configuration", "Release"], { stdio: "inherit" });
}
let database;
let server;
let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  server?.kill();
  try { await database?.stop(); }
  catch (error) { console.error("Test database cleanup failed", error); code = 1; }
  await unlink("playwright/.cache/test-web-database.json").catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
  process.exit(code);
}
process.on("SIGTERM", () => void stop(0));
process.on("SIGINT", () => void stop(0));
try {
  database = await startTestDatabase();
  await mkdir("playwright/.cache", { recursive: true });
  await writeFile("playwright/.cache/test-web-database.json", JSON.stringify({ name: database.name }));
  const env = { ...process.env, DATABASE_URL: database.connectionString };
  execFileSync(process.execPath, ["../../node_modules/next/dist/bin/next", "build"], { cwd: "app/web", env, stdio: "inherit" });
  server = spawn(process.execPath, ["../../node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: "app/web", env, stdio: "inherit" });
  server.on("exit", code => void stop(code ?? 1));
  server.on("error", () => void stop(1));
} catch (error) {
  console.error("Test web server failed", error);
  await stop(1);
}
