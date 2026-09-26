import { expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { getAuthTables } from "better-auth/db";
import { readFile } from "node:fs/promises";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { createAuth } from "../../app/web/src/lib/create-auth";

let database: Awaited<ReturnType<typeof startTestDatabase>>;
const instances: ReturnType<typeof createAuth>[] = [];
const baseURL = "http://localhost:3000";
function instance() {
  const value = createAuth({
    BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: baseURL, DATABASE_URL: database.connectionString,
    GITHUB_CLIENT_ID: "test-client", GITHUB_CLIENT_SECRET: "test-secret",
    EMAIL_DELIVERY: "log",
  });
  instances.push(value);
  return value;
}
function request(path: string, ip: string, body?: object) {
  return new Request(`${baseURL}/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-vercel-forwarded-for": ip, "content-type": "application/json", origin: baseURL },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { test.setTimeout(180_000); database = await startTestDatabase(); });
test.afterAll(async () => {
  await Promise.all(instances.map(value => value.pool.end()));
  await database?.stop();
});

test("rate-limit schema matches Better Auth and denies browser roles", async () => {
  const contract = getAuthTables({ rateLimit: { storage: "database" } }).rateLimit;
  const { rows } = await database.pool.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='rateLimit'");
  expect(rows).toHaveLength(Object.keys(contract.fields).length + 1);
  for (const [name, type] of Object.entries({ id: "text", key: "text", count: "integer", lastRequest: "bigint" })) {
    expect(rows).toContainEqual({ column_name: name, data_type: type });
  }
  const { rows: tables } = await database.pool.query("SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='rateLimit'");
  expect(tables[0].rowsecurity).toBe(true);
  for (const role of ["anon", "authenticated"]) {
    const client = await database.pool.connect();
    try {
      await client.query(`SET ROLE ${role}`);
      await expect(client.query('SELECT * FROM public."rateLimit"')).rejects.toThrow(/permission denied/);
    } finally { await client.query("RESET ROLE"); client.release(); }
  }
});

test("database limits are shared across instances and concurrent requests", async () => {
  const first = instance();
  const second = instance();
  // Override only the threshold for this test; use the production database adapter and headers.
  const options = { ...first.auth.options, rateLimit: { storage: "database" as const, enabled: true, max: 3, window: 60 } };
  const a = betterAuth(options);
  const b = betterAuth({ ...options, database: second.pool });
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    (index % 2 ? a : b).handler(request("/sign-out", "192.0.2.80", {}))));
  expect(responses.filter(response => response.status === 200)).toHaveLength(3);
  expect(responses.filter(response => response.status === 429)).toHaveLength(9);
  expect((await b.handler(request("/sign-out", "192.0.2.81", {}))).status).toBe(200);
  const fresh = instance();
  expect((await betterAuth({ ...options, database: fresh.pool }).handler(request("/sign-out", "192.0.2.80", {}))).status).toBe(429);
  await database.pool.query('UPDATE "rateLimit" SET "lastRequest" = 0 WHERE key = $1', ["192.0.2.80|/sign-out"]);
  expect((await a.handler(request("/sign-out", "192.0.2.80", {}))).status).toBe(200);
});

test("OAuth cancellation returns to the configured error page with valid state", async () => {
  const { auth } = instance();
  const response = await auth.handler(request("/sign-in/social", "192.0.2.82", { provider: "github", callbackURL: "/dashboard", errorCallbackURL: "/auth/error" }));
  expect(response.status).toBe(200);
  const { url } = await response.json();
  const state = new URL(url).searchParams.get("state");
  expect(state).toBeTruthy();
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const callback = request(`/callback/github?state=${encodeURIComponent(state!)}&error=access_denied`, "192.0.2.82");
  callback.headers.set("cookie", cookie);
  const result = await auth.handler(callback);
  expect(result.status).toBe(302);
  expect(new URL(result.headers.get("location")!, baseURL).pathname).toBe("/auth/error");
  expect(new URL(result.headers.get("location")!, baseURL).searchParams.get("error")).toBe("access_denied");
});

test("joins preserve valid, expired and revoked session behavior", async ({}, testInfo) => {
  const { auth } = instance();
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Join test", email: "join@example.invalid", emailVerified: true }, { method: "admin" });
  const session = await context.internalAdapter.createSession(user.id, false);
  expect(session).toBeTruthy();
  const withoutJoins = betterAuth({ ...auth.options, advanced: { ...auth.options.advanced, database: { validateSchema: false, joins: false } } });
  const plainContext = await withoutJoins.$context;
  const plain = await plainContext.internalAdapter.findSession(session!.token);
  const joined = await context.internalAdapter.findSession(session!.token);
  expect(joined).toEqual(plain);
  expect(joined?.user.id).toBe(user.id);
  const measurements: Record<string, { medianMs: number; p95Ms: number }> = {};
  for (const [name, adapter] of [["withoutJoins", plainContext.internalAdapter], ["withJoins", context.internalAdapter]] as const) {
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      expect((await adapter.findSession(session!.token))?.user.id).toBe(user.id);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    measurements[name] = { medianMs: samples[10], p95Ms: samples[18] };
  }
  await testInfo.attach("local-session-join-timings", { body: JSON.stringify(measurements), contentType: "application/json" });
  // Use the library's signed cookie format to exercise the HTTP session endpoint.
  const { makeSignature } = await import("better-auth/crypto");
  const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session!.token}.${await makeSignature(session!.token, context.secret)}`)}`;
  const getSession = () => auth.handler(new Request(`${baseURL}/api/auth/get-session`, { headers: { cookie, "x-vercel-forwarded-for": "192.0.2.83" } }));
  expect((await (await getSession()).json())?.user.id).toBe(user.id);
  await database.pool.query('UPDATE "session" SET "expiresAt" = now() - interval \'1 hour\' WHERE id = $1', [session!.id]);
  expect(await (await getSession()).json()).toBeNull();
  const active = await context.internalAdapter.createSession(user.id, false);
  await context.internalAdapter.deleteSession(active!.token);
  expect(await context.internalAdapter.findSession(active!.token)).toBeNull();
});

test("rate-limit rollback preserves existing auth tables and can be reapplied", async () => {
  const readSql = async (path: string) => (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
  await database.pool.query(await readSql("docs/schema/auth-rate-limits-rollback.sql"));
  expect((await database.pool.query("SELECT to_regclass('public.\"rateLimit\"') AS table_name")).rows[0].table_name).toBeNull();
  expect((await database.pool.query('SELECT count(*) FROM "user"')).rows[0].count).not.toBe("0");
  await database.pool.query(await readSql("docs/schema/auth-rate-limits.sql"));
  expect((await database.pool.query('SELECT count(*) FROM "rateLimit"')).rows[0].count).toBe("0");
});
