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

test("unimplemented API routes return not found", async ({ request }) => {
  const response = await request.get("/requirements");
  expect(response.status()).toBe(404);
});
