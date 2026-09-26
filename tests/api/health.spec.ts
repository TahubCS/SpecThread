import { expect, test } from "@playwright/test";

test("API liveness works without database credentials", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("OpenAPI describes the health endpoint in development", async ({ request }) => {
  const response = await request.get("/openapi/v1.json");
  expect(response.status()).toBe(200);
  const document = await response.json();
  expect(document.paths["/health"].get.responses["200"]).toBeDefined();
});

test("unimplemented API routes require authentication, then return not found", async ({ request }) => {
  expect((await request.get("/requirements")).status()).toBe(401);
  // Token from the test JWKS issuer (scripts/start-test-jwks.mjs).
  const { token } = await (await request.post("http://127.0.0.1:5101/sign", { data: {} })).json();
  const response = await request.get("/requirements", { headers: { authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(404);
});
