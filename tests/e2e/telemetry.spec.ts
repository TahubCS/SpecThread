import { randomBytes, randomUUID } from "node:crypto";
import { newTrace, received, testAuthorization } from "../support/otlp";
import { createTestSession, expect, test } from "./fixtures";

// The browser-test web app and API send telemetry to the fake receiver on 5126
// (scripts/start-test-web.mjs). Each test starts its own trace with a traceparent header and
// finds its spans by that trace ID.
test.use({ signedIn: false });

test("an invitation link is one trace from web to API, and its token is never sent", async ({ page }) => {
  const secret = randomBytes(32).toString("hex");
  const trace = newTrace();
  await page.setExtraHTTPHeaders({ traceparent: trace.header });
  await page.goto(`/invites/${secret}`);

  await expect.poll(async () => (await received(trace.bytes, "specthread-web", "/invites/[token]")).length).toBeGreaterThan(0);
  await expect.poll(async () => (await received(trace.bytes, "specthread-api", "GET /invites/{token}")).length).toBeGreaterThan(0);
  expect(await received(secret)).toEqual([]);
  for (const { authorization } of await received(trace.bytes)) expect(authorization).toBe(testAuthorization);
});

test("a signed-in page records the user by ID, never by email, name, or session token", async ({ context, page }) => {
  const name = `Telemetry ${randomUUID()}`;
  const session = await createTestSession(name);
  try {
    await context.addCookies([session.cookie]);
    const trace = newTrace();
    await page.setExtraHTTPHeaders({ traceparent: trace.header });
    await page.goto("/teams");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expect.poll(async () => (await received(trace.bytes, "specthread-web", "user.id", session.userId)).length).toBeGreaterThan(0);
    await expect.poll(async () => (await received(trace.bytes, "specthread-api", "user.id", session.userId)).length).toBeGreaterThan(0);
    expect(await received(`${session.userId}@example.invalid`)).toEqual([]);
    expect(await received(name)).toEqual([]);
    expect(await received(session.cookie.value.split(".")[0])).toEqual([]);
  } finally {
    await session.remove();
  }
});
