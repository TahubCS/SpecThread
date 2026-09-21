import { expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { readAuthConfig } from "../../app/web/src/lib/auth-config";

const env = {
  BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "https://specthread.example",
  DATABASE_URL: "postgres://user:password@db.example/postgres?sslmode=require",
};

test("auth rate limits prefer the Vercel IP and keep separate clients independent", async () => {
  const config = readAuthConfig(env);
  const auth = betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    advanced: { ipAddress: { ipAddressHeaders: config.ipAddressHeaders } },
    rateLimit: { enabled: true, storage: "memory", window: 60, max: 1 },
  });
  const signOut = (headers: Record<string, string>) => auth.handler(new Request(
    `${config.baseURL}/api/auth/sign-out`,
    { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" },
  ));

  expect((await signOut({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "198.51.100.1" })).status).toBe(200);
  const limited = await signOut({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "198.51.100.2" });
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("x-retry-after"))).toBeGreaterThan(0);
  expect((await signOut({ "x-vercel-forwarded-for": "192.0.2.2", "x-forwarded-for": "198.51.100.1" })).status).toBe(200);
});

test("auth falls back to forwarded IP and ignores unrelated IP headers", async () => {
  const config = readAuthConfig(env);
  const auth = betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    advanced: { ipAddress: { ipAddressHeaders: config.ipAddressHeaders } },
    rateLimit: { enabled: true, storage: "memory", window: 60, max: 1 },
  });
  const signOut = (headers: Record<string, string>) => auth.handler(new Request(
    `${config.baseURL}/api/auth/sign-out`,
    { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" },
  ));

  expect((await signOut({ "x-forwarded-for": "203.0.113.1", "cf-connecting-ip": "192.0.2.10" })).status).toBe(200);
  expect((await signOut({ "x-vercel-forwarded-for": "invalid", "x-forwarded-for": "203.0.113.1", "cf-connecting-ip": "192.0.2.11" })).status).toBe(429);
  expect((await signOut({ "x-forwarded-for": "203.0.113.2" })).status).toBe(200);
});

test("auth requires explicit configuration without leaking invalid credentials", () => {
  for (const name of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "DATABASE_URL"]) {
    expect(() => readAuthConfig({ ...env, [name]: "" })).toThrow(/Configure/);
  }
  expect(() => readAuthConfig({ ...env, BETTER_AUTH_SECRET: "short" })).toThrow(/random secret/);
  expect(() => readAuthConfig({ ...env, DATABASE_URL: "private-invalid-credential" })).toThrow("Configure a valid PostgreSQL DATABASE_URL.");
});

test("auth trusts only the configured origin and dashboard integration is opt-in", () => {
  expect(readAuthConfig(env).trustedOrigins).toEqual([env.BETTER_AUTH_URL]);
  expect(readAuthConfig(env).dashboardApiKey).toBeUndefined();
  for (const url of ["https://*.vercel.app", "http://remote.example", "https://app.example/path", "https://user:pass@app.example"]) {
    expect(() => readAuthConfig({ ...env, BETTER_AUTH_URL: url })).toThrow(/exact HTTPS origin/);
  }
});

test("remote PostgreSQL requires verified TLS and URL parameters cannot override it", () => {
  const config = readAuthConfig({ ...env, DATABASE_CA_CERT: "certificate\\ncontents" });
  expect(config.pool.ssl).toEqual({ rejectUnauthorized: true, ca: "certificate\ncontents" });
  expect(config.pool.connectionString).not.toContain("sslmode");
  for (const query of ["sslmode=no-verify", "sslmode=disable", "ssl=false", "sslrootcert=untrusted", "host=localhost"]) {
    expect(() => readAuthConfig({ ...env, DATABASE_URL: `postgres://user:password@db.example/postgres?${query}` })).toThrow(/DATABASE_URL supports only/);
  }
  expect(readAuthConfig({ ...env, DATABASE_URL: "postgres://user:password@127.0.0.1:1/offline" }).pool.ssl).toBe(false);
});
