import { expect, test } from "@playwright/test";
import { startApi } from "../support/api-process";

let api: Awaited<ReturnType<typeof startApi>>;
test.beforeAll(async () => { api = await startApi(5104, {}); });
test.afterAll(() => api?.stop());

test("without Auth:Issuer the API starts but refuses to authenticate tokens", async ({ request }) => {
  expect((await request.get(`${api.baseURL}/health`)).status()).toBe(200);
  expect((await request.get(`${api.baseURL}/me`)).status()).toBe(401);
  // A presented token fails explicitly instead of being silently accepted or ignored.
  const response = await request.get(`${api.baseURL}/me`, { headers: { authorization: "Bearer a.b.c" } });
  expect(response.status()).toBe(500);
});
