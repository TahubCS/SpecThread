import { expect, test, type APIRequestContext } from "@playwright/test";

// Tokens come from scripts/start-test-jwks.mjs, the API's configured issuer in tests.
const issuer = "http://127.0.0.1:5101";

async function mint(request: APIRequestContext, options: object = {}) {
  const response = await request.post(`${issuer}/sign`, { data: options });
  expect(response.status()).toBe(200);
  return (await response.json()).token as string;
}

function me(request: APIRequestContext, token?: string) {
  return request.get("/me", token ? { headers: { authorization: `Bearer ${token}` } } : {});
}

test("a valid Better Auth-shaped token identifies the user", async ({ request }) => {
  const response = await me(request, await mint(request, { claims: { sub: "user-123" } }));
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ userId: "user-123" });
});

test("protected endpoints reject requests without a token", async ({ request }) => {
  const response = await me(request);
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toContain("Bearer");
});

test("malformed tokens are rejected", async ({ request }) => {
  expect((await me(request, "not-a-jwt")).status()).toBe(401);
});

const now = () => Math.floor(Date.now() / 1000);
const rejected: [string, () => object][] = [
  ["expired", () => ({ claims: { iat: now() - 3600, exp: now() - 600 } })],
  ["wrong issuer", () => ({ claims: { iss: "https://attacker.example" } })],
  ["wrong audience", () => ({ claims: { aud: "https://other.example" } })],
  ["missing expiry", () => ({ claims: { exp: null } })],
  ["signed by an unpublished key", () => ({ key: "unpublished" })],
  ["HS256", () => ({ key: "hs256" })],
  ["alg none", () => ({ key: "none" })],
];
for (const [name, options] of rejected) {
  test(`tokens that are ${name} are rejected`, async ({ request }) => {
    expect((await me(request, await mint(request, options()))).status()).toBe(401);
  });
}

test("tokens without a subject are forbidden", async ({ request }) => {
  const response = await me(request, await mint(request, { claims: { sub: null } }));
  expect(response.status()).toBe(403);
});

test("health stays anonymous and OpenAPI describes the current user endpoint", async ({ request }) => {
  expect((await request.get("/health")).status()).toBe(200);
  const document = await (await request.get("/openapi/v1.json")).json();
  expect(document.paths["/me"].get.responses["200"]).toBeDefined();
  expect(document.paths["/me"].get.responses["401"]).toBeDefined();
});
