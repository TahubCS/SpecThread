import { spawn, execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { startTestDatabase } from "./test-database.mjs";
import buildApi from "./build-api.mjs";
import { startApiProxy } from "./test-api-proxy.mjs";
import { startFakeGitHub } from "./test-github.mjs";

// Playwright starts webServer entries in order, before globalSetup.
// Build here before the second entry starts the API and locks its DLL on Windows.
buildApi();
// The product API for browser tests. It shares the web test database and trusts the test web app's tokens.
const apiOrigin = "http://127.0.0.1:5106";
// The web app reaches the API through this proxy, so tests can make API calls fail for one user.
const proxyOrigin = "http://127.0.0.1:5107";
// A stand-in for GitHub, so tests never reach the real one. The app key exists only for this run.
const gitHubOrigin = "http://127.0.0.1:5108";
const gitHubAppId = "424242";
const gitHubKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
let database;
let api;
let server;
let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  server?.kill();
  api?.kill();
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
  const url = new URL(database.connectionString);
  api = spawn("dotnet", ["app/api/bin/Release/net10.0/SpecThread.Api.dll", "--urls", apiOrigin, "--environment", "Development"], {
    env: {
      ...process.env,
      ConnectionStrings__Database: `Host=${url.hostname};Port=${url.port};Database=postgres;Username=${url.username};Password=${url.password}`,
      Auth__Issuer: process.env.BETTER_AUTH_URL,
      GitHub__ApiBaseUrl: gitHubOrigin,
      GitHub__AppId: gitHubAppId,
      GitHub__AppSlug: "specthread-test",
      GitHub__PrivateKey: gitHubKey.privateKey.export({ type: "pkcs1", format: "pem" }),
    },
    stdio: "inherit",
  });
  api.on("exit", code => void stop(code ?? 1));
  api.on("error", () => void stop(1));
  await startApiProxy({ port: 5107, upstream: apiOrigin });
  await startFakeGitHub({ port: 5108, appId: gitHubAppId, publicKey: gitHubKey.publicKey });
  const env = { ...process.env, DATABASE_URL: database.connectionString, SPECTHREAD_API_URL: proxyOrigin };
  execFileSync(process.execPath, ["../../node_modules/next/dist/bin/next", "build"], { cwd: "app/web", env, stdio: "inherit" });
  server = spawn(process.execPath, ["../../node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: "app/web", env, stdio: "inherit" });
  server.on("exit", code => void stop(code ?? 1));
  server.on("error", () => void stop(1));
} catch (error) {
  console.error("Test web server failed", error);
  await stop(1);
}
