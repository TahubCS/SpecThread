import { test as base, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { makeSignature } from "better-auth/crypto";

export type TestCookie = { name: string; value: string; url: string };

/** Runs SQL in the web test database, which the browser-test API shares. Never pass untrusted text. */
export async function runTestSql(sql: string) {
  const { name } = JSON.parse(await readFile("playwright/.cache/test-web-database.json", "utf8"));
  execFileSync("docker", [
    "exec", "-u", "postgres", name, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { stdio: "ignore" });
}

/**
 * Seeds a verified user and a one-day session in the test database and returns a
 * signed Better Auth session cookie. `remove` deletes test-owned product rows before the user/session.
 * Tests that log out must use their own session, not the shared worker session.
 */
export async function createTestSession(displayName: string, onboarded = true) {
  const secret = process.env.SPECTHREAD_TEST_AUTH_SECRET;
  if (!secret) throw new Error("Test auth secret is missing");
  const userId = randomUUID();
  const token = randomUUID();
  await runTestSql(`INSERT INTO public."user" (id,name,email,"emailVerified","createdAt","updatedAt")
    VALUES ('${userId}','${displayName}','${userId}@example.invalid',true,now(),now());
    INSERT INTO public.session (id,"userId",token,"expiresAt","createdAt","updatedAt")
    VALUES ('${randomUUID()}','${userId}','${token}',now() + interval '1 day',now(),now());`);
  if (onboarded) await runTestSql(`INSERT INTO public.user_onboarding (user_id,completed_at) VALUES ('${userId}',now());`);
  const cookie: TestCookie = {
    name: "better-auth.session_token",
    value: `${token}.${await makeSignature(token, secret)}`,
    url: "http://127.0.0.1:3100",
  };
  return { userId, cookie, remove: () => runTestSql(`
    DELETE FROM public.team_invitations WHERE team_id IN (SELECT id FROM public.teams WHERE owner_user_id = '${userId}') OR invited_by = '${userId}' OR accepted_by = '${userId}';
    DELETE FROM public.team_members WHERE team_id IN (SELECT id FROM public.teams WHERE owner_user_id = '${userId}') OR user_id = '${userId}';
    DELETE FROM public.teams WHERE owner_user_id = '${userId}';
    DELETE FROM public."user" WHERE id = '${userId}';`) };
}

/**
 * Creates a team owned by the user directly in the test database and returns its ID.
 * Projects belong to a team, so tests that create a project need one first.
 */
export async function createTestTeam(ownerId: string, name = "Test team") {
  const teamId = randomUUID();
  await runTestSql(`INSERT INTO public.teams (id,name,description,owner_user_id) VALUES ('${teamId}','${name}','','${ownerId}');
    INSERT INTO public.team_members (team_id,user_id) VALUES ('${teamId}','${ownerId}');`);
  return teamId;
}

/** Adds a user to the team of a project, which is how a user gets access to the project. */
export async function addTestTeamMember(projectId: string, userId: string, role: "member" | "admin" = "member") {
  await runTestSql(`INSERT INTO public.team_members (team_id,user_id,role)
    SELECT team_id,'${userId}','${role}' FROM public.projects WHERE id = '${projectId}' ON CONFLICT DO NOTHING`);
}

/** Playwright test that starts signed in unless a file or describe block sets `signedIn: false`. */
export const test = base.extend<{ signedIn: boolean }, { sessionCookie: TestCookie }>({
  signedIn: [true, { option: true }],
  // Playwright's fixture callback is named `provide`, not `use`, so React's hook lint rule ignores it.
  sessionCookie: [
    async ({}, provide) => {
      const session = await createTestSession("Test user");
      await provide(session.cookie);
      await session.remove();
    },
    { scope: "worker" },
  ],
  context: async ({ context, signedIn, sessionCookie }, provide) => {
    if (signedIn) await context.addCookies([sessionCookie]);
    await provide(context);
  },
});

export { expect };
