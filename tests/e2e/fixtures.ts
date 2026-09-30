import { test as base, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { makeSignature } from "better-auth/crypto";

export type TestCookie = { name: string; value: string; url: string };

/**
 * Seeds a verified user and a one-day session in the test database and returns a
 * signed Better Auth session cookie. `remove` deletes the user and, by cascade, the session.
 * Tests that log out must use their own session, not the shared worker session.
 */
export async function createTestSession(displayName: string) {
  const { name } = JSON.parse(await readFile("playwright/.cache/test-web-database.json", "utf8"));
  const secret = process.env.SPECTHREAD_TEST_AUTH_SECRET;
  if (!secret) throw new Error("Test auth secret is missing");
  const userId = randomUUID();
  const token = randomUUID();
  const runSql = (sql: string) => execFileSync("docker", [
    "exec", "-u", "postgres", name, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { stdio: "ignore" });
  runSql(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt")
    VALUES ('${userId}','${displayName}','${userId}@example.invalid',true,now(),now());
    INSERT INTO public.session (id,"userId",token,"expiresAt","createdAt","updatedAt")
    VALUES ('${randomUUID()}','${userId}','${token}',now() + interval '1 day',now(),now());`);
  const cookie: TestCookie = {
    name: "better-auth.session_token",
    value: `${token}.${await makeSignature(token, secret)}`,
    url: "http://127.0.0.1:3100",
  };
  return { userId, cookie, remove: () => runSql(`DELETE FROM public."user" WHERE id = '${userId}'`) };
}

/** Playwright test that starts signed in unless a file or describe block sets `signedIn: false`. */
export const test = base.extend<{ signedIn: boolean }, { sessionCookie: TestCookie }>({
  signedIn: [true, { option: true }],
  // Playwright's fixture callback is named `provide`, not `use`, so React's hook lint rule ignores it.
  sessionCookie: [
    async ({}, provide) => {
      const session = await createTestSession("Test user");
      await provide(session.cookie);
      session.remove();
    },
    { scope: "worker" },
  ],
  context: async ({ context, signedIn, sessionCookie }, provide) => {
    if (signedIn) await context.addCookies([sessionCookie]);
    await provide(context);
  },
});

export { expect };
