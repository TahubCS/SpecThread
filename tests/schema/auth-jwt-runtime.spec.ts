import { expect, test } from "@playwright/test";
import { betterAuth } from "better-auth";
import { makeSignature } from "better-auth/crypto";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins";
import { createServer, type Server } from "node:http";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { createAuth } from "../../app/web/src/lib/create-auth";
import { startApi } from "../support/api-process";

// Real Better Auth tokens validated by the real API, including the one-time
// EdDSA-to-ES256 key expiry documented in docs/DEPLOYMENT.md.
const authOrigin = "http://127.0.0.1:5102";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let web: ReturnType<typeof createAuth>;
let server: Server;
let api: Awaited<ReturnType<typeof startApi>>;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  database = await startTestDatabase();
  web = createAuth({
    BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: authOrigin, DATABASE_URL: database.connectionString,
  });
  server = createServer(toNodeHandler(web.auth));
  await new Promise<void>(resolve => server.listen(5102, "127.0.0.1", resolve));
  api = await startApi(5103, { Auth__Issuer: authOrigin });
});
test.afterAll(async () => {
  api?.stop();
  await new Promise(resolve => server ? server.close(resolve) : resolve(undefined));
  await web?.pool.end();
  await database?.stop();
});

test("ES256 Better Auth tokens authenticate API requests after legacy EdDSA keys are expired", async ({ request }) => {
  // Simulate an existing deployment whose JWKS was created with the EdDSA default.
  const legacy = betterAuth({ ...web.auth.options, plugins: [jwt()] });
  expect((await legacy.handler(new Request(`${authOrigin}/api/auth/jwks`))).status).toBe(200);
  const { rows: before } = await database.pool.query("SELECT alg FROM public.jwks");
  expect(before.map(row => row.alg ?? "EdDSA")).toEqual(["EdDSA"]);

  await database.pool.query(`UPDATE public.jwks SET "expiresAt" = now() WHERE alg IS NULL OR alg = 'EdDSA'`);

  const context = await web.auth.$context;
  const user = await context.internalAdapter.createUser({ name: "JWT test", email: "jwt@example.invalid", emailVerified: true }, { method: "admin" });
  const session = await context.internalAdapter.createSession(user.id, false);
  const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session!.token}.${await makeSignature(session!.token, context.secret)}`)}`;
  const tokenResponse = await request.get(`${authOrigin}/api/auth/token`, { headers: { cookie } });
  expect(tokenResponse.status()).toBe(200);
  const { token } = await tokenResponse.json();
  const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
  expect(header.alg).toBe("ES256");

  const { keys } = await (await request.get(`${authOrigin}/api/auth/jwks`)).json();
  expect(keys.map((key: { alg: string }) => key.alg).sort()).toEqual(["ES256", "EdDSA"]);

  const me = await request.get(`${api.baseURL}/me`, { headers: { authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(200);
  expect(await me.json()).toEqual({ userId: user.id });
  expect((await request.get(`${api.baseURL}/me`)).status()).toBe(401);
});
