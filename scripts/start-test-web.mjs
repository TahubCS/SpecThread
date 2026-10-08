import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { startTestDatabase } from "./test-database.mjs";
import buildApi from "./build-api.mjs";

// Playwright starts webServer entries in order, before globalSetup.
// Build here before the second entry starts the API and locks its DLL on Windows.
buildApi();
let database;
let server;
let apiServer;
let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  server?.kill();
  apiServer?.kill();
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
  const apiOrigin = "http://127.0.0.1:5106";
  const env = { ...process.env, DATABASE_URL: database.connectionString, SPECTHREAD_API_URL: apiOrigin };
  execFileSync(process.execPath, ["../../node_modules/next/dist/bin/next", "build"], { cwd: "app/web", env, stdio: "inherit" });
  const connection = new URL(database.connectionString);
  apiServer = spawn("dotnet", ["app/api/bin/Release/net10.0/SpecThread.Api.dll", "--urls", apiOrigin, "--environment", "Development"], {
    env: { ...process.env, Auth__Issuer: env.BETTER_AUTH_URL,
      ConnectionStrings__Database: `Host=${connection.hostname};Port=${connection.port};Database=postgres;Username=${connection.username};Password=${connection.password}` },
    stdio: "inherit",
  });
  apiServer.on("error", () => void stop(1));
  apiServer.on("exit", code => { if (!stopping) void stop(code || 1); });
  for (let attempt = 0; ; attempt++) {
    if (apiServer.exitCode !== null) throw new Error("The browser-test API exited before it was ready.");
    try { if ((await fetch(`${apiOrigin}/health`)).ok) break; } catch { /* Wait for the local process. */ }
    if (attempt === 119) throw new Error("The browser-test API did not become ready.");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  server = spawn(process.execPath, ["../../node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: "app/web", env, stdio: "inherit" });
  server.on("exit", code => void stop(code ?? 1));
  server.on("error", () => void stop(1));
} catch (error) {
  console.error("Test web server failed", error);
  await stop(1);
}
