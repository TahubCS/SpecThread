import { expect, test } from "@playwright/test";
import { readAuthConfig } from "../../app/web/src/lib/auth-config";

const env = {
  BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "https://specthread.example",
  DATABASE_URL: "postgres://user:password@db.example/postgres?sslmode=require",
};

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
