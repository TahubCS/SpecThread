import { expect, test } from "@playwright/test";
import { startTestDatabase } from "../../scripts/test-database.mjs";
import { createAuth } from "../../app/web/src/lib/create-auth";
import type { EmailMessage } from "../../app/web/src/lib/email";

// Real Better Auth email/password, verification, reset and linking flows on
// Docker Postgres. Emails are captured instead of delivered.
const baseURL = "http://localhost:3000";
const email = "person@example.invalid";
const password = "correct horse battery";
let database: Awaited<ReturnType<typeof startTestDatabase>>;
let web: ReturnType<typeof createAuth>;
const sent: EmailMessage[] = [];

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  test.setTimeout(180_000);
  database = await startTestDatabase();
  web = createAuth({
    BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
    BETTER_AUTH_URL: baseURL, DATABASE_URL: database.connectionString, EMAIL_DELIVERY: "log",
    GITHUB_CLIENT_ID: "github-client", GITHUB_CLIENT_SECRET: "github-secret",
    GOOGLE_CLIENT_ID: "google-client", GOOGLE_CLIENT_SECRET: "google-secret",
  }, { sendEmail: async message => { sent.push(message); } });
});
test.afterAll(async () => {
  await web?.pool.end();
  await database?.stop();
});

function call(path: string, options: { body?: object; cookie?: string } = {}) {
  return web.auth.handler(new Request(path.startsWith("http") ? path : `${baseURL}/api/auth${path}`, {
    method: options.body ? "POST" : "GET",
    headers: { "content-type": "application/json", origin: baseURL, ...(options.cookie ? { cookie: options.cookie } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  }));
}
const cookieOf = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
const linkIn = (message: EmailMessage) => message.text.match(/https?:\/\/\S+/)![0];
const signIn = (secret: string) => call("/sign-in/email", { body: { email, password: secret } });

test("sign-up stores a hashed credential and requires email verification", async () => {
  const response = await call("/sign-up/email", { body: { name: "Person", email, password, callbackURL: "/dashboard" } });
  expect(response.status).toBe(200);
  expect(cookieOf(response)).not.toContain("session_token");
  const { rows: [user] } = await database.pool.query('SELECT id, "emailVerified" FROM "user" WHERE email = $1', [email]);
  expect(user.emailVerified).toBe(false);
  const { rows: [account] } = await database.pool.query('SELECT "providerId", password FROM account WHERE "userId" = $1', [user.id]);
  expect(account.providerId).toBe("credential");
  expect(account.password).toBeTruthy();
  expect(account.password).not.toContain(password);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ to: email, subject: "Verify your SpecThread email" });

  const blocked = await signIn(password);
  expect(blocked.status).toBe(403);
  expect((await blocked.json()).code).toBe("EMAIL_NOT_VERIFIED");
});

test("duplicate sign-up looks the same and creates nothing", async () => {
  const response = await call("/sign-up/email", { body: { name: "Other", email, password: "another long password" } });
  expect(response.status).toBe(200);
  const { rows } = await database.pool.query('SELECT count(*)::int AS count FROM "user" WHERE email = $1', [email]);
  expect(rows[0].count).toBe(1);
  expect(sent).toHaveLength(1);
});

test("the verification link verifies the email and signs the user in", async () => {
  const response = await call(linkIn(sent[0]));
  expect(response.status).toBe(302);
  expect(new URL(response.headers.get("location")!, baseURL).pathname).toBe("/dashboard");
  expect(cookieOf(response)).toContain("session_token");
  const { rows: [user] } = await database.pool.query('SELECT "emailVerified" FROM "user" WHERE email = $1', [email]);
  expect(user.emailVerified).toBe(true);
  expect((await signIn(password)).status).toBe(200);
  expect((await signIn("wrong password here")).status).toBe(401);
});

test("password reset is single-use, changes the password and revokes sessions", async () => {
  const session = cookieOf(await signIn(password));
  const unknown = await call("/request-password-reset", { body: { email: "nobody@example.invalid", redirectTo: "/reset-password" } });
  expect(unknown.status).toBe(200);
  const before = sent.length;
  expect((await call("/request-password-reset", { body: { email, redirectTo: "/reset-password" } })).status).toBe(200);
  expect(sent).toHaveLength(before + 1);
  expect(sent.at(-1)!.subject).toBe("Reset your SpecThread password");

  const landing = await call(linkIn(sent.at(-1)!));
  expect(landing.status).toBe(302);
  const target = new URL(landing.headers.get("location")!, baseURL);
  expect(target.pathname).toBe("/reset-password");
  const token = target.searchParams.get("token")!;
  const newPassword = "a brand new passphrase";
  expect((await call("/reset-password", { body: { newPassword, token } })).status).toBe(200);
  expect((await call("/reset-password", { body: { newPassword: "yet another passphrase", token } })).status).toBe(400);

  expect(await (await call("/get-session", { cookie: session })).json()).toBeNull();
  expect((await signIn(password)).status).toBe(401);
  expect((await signIn(newPassword)).status).toBe(200);
});

test("linking starts provider sign-in for the signed-in user and the last method cannot be removed", async () => {
  const session = cookieOf(await signIn("a brand new passphrase"));
  for (const [provider, host] of [["github", "github.com"], ["google", "accounts.google.com"]]) {
    const response = await call("/link-social", { cookie: session, body: { provider, callbackURL: "/account" } });
    expect(response.status).toBe(200);
    expect(new URL((await response.json()).url).hostname).toBe(host);
  }
  const unauthenticated = await call("/link-social", { body: { provider: "github", callbackURL: "/account" } });
  expect(unauthenticated.status).toBe(401);

  const accounts = await (await call("/list-accounts", { cookie: session })).json();
  expect(accounts.map((account: { providerId: string }) => account.providerId)).toEqual(["credential"]);
  const unlink = await call("/unlink-account", { cookie: session, body: { accountId: accounts[0].id } });
  expect(unlink.status).toBe(400);
  expect((await unlink.json()).code).toBe("FAILED_TO_UNLINK_LAST_ACCOUNT");
});
