import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { clientAddressFromHeaders, hashIp, parseHeaders, redactAttributes, redactText } from "../../app/web/src/lib/telemetry";
import { startApi } from "../support/api-process";
import { newTrace, received, testAuthorization } from "../support/otlp";

// An API on 5127 sends telemetry to the fake receiver on 5126, which scripts/start-test-web.mjs
// starts for every run. It has no database, so database-backed routes answer 500.
const telemetry = {
  Auth__Issuer: "http://127.0.0.1:5101",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:5126",
  OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Basic%20dGVzdA==",
  OTEL_BSP_SCHEDULE_DELAY: "200",
  OTEL_BLRP_SCHEDULE_DELAY: "200",
  OTEL_METRIC_EXPORT_INTERVAL: "500",
};

let api: Awaited<ReturnType<typeof startApi>>;
test.beforeAll(async () => { api = await startApi(5127, telemetry); });
test.afterAll(() => api?.stop());

async function mint(request: APIRequestContext, sub: string) {
  const response = await request.post("http://127.0.0.1:5101/sign", { data: { claims: { sub } } });
  return (await response.json()).token as string;
}

test("requests are traced by route with the caller's ID, and secrets in the path or token never leave", async ({ request }) => {
  const secret = randomBytes(32).toString("hex");
  const userId = `telemetry-${randomUUID()}`;
  const token = await mint(request, userId);
  const health = newTrace();
  const ready = newTrace();
  const me = newTrace();
  const invite = newTrace();
  const unknown = newTrace();

  expect((await request.get(`${api.baseURL}/health`, { headers: { traceparent: health.header } })).status()).toBe(200);
  expect((await request.get(`${api.baseURL}/health/ready`, { headers: { traceparent: ready.header } })).status()).toBe(503);
  expect((await request.get(`${api.baseURL}/me`, { headers: { authorization: `Bearer ${token}`, traceparent: me.header } })).status()).toBe(200);
  expect((await request.get(`${api.baseURL}/invites/${secret}?token=${secret}`, { headers: { traceparent: invite.header } })).status()).toBe(500);
  expect((await request.get(`${api.baseURL}/unknown/${secret}`, { headers: { traceparent: unknown.header } })).status()).toBe(401);

  // Each span is named by its route and carries the route template, never the raw path.
  // Without OTEL_RESOURCE_ATTRIBUTES the environment name is the ASP.NET environment's.
  await expect.poll(async () => (await received(me.bytes, "GET /me", "user.id", userId, "specthread-api", "development")).length).toBeGreaterThan(0);
  await expect.poll(async () => (await received(invite.bytes, "GET /invites/{token}")).length).toBeGreaterThan(0);
  await expect.poll(async () => (await received(unknown.bytes, "specthread-api")).length).toBeGreaterThan(0);
  // The failure's error log carries the same trace ID, so it links to the span.
  await expect.poll(async () => (await received(invite.bytes)).some(({ path }) => path === "/v1/logs")).toBe(true);
  // Request metrics arrive, labelled by route.
  await expect.poll(async () => (await received("http.server.request.duration", "/me")).some(({ path }) => path === "/v1/metrics")).toBe(true);

  expect(await received(secret)).toEqual([]);
  expect(await received(token)).toEqual([]);
  expect(await received(token.split(".")[2])).toEqual([]);
  // Health and readiness checks are counted in metrics but not traced. A failed readiness
  // check logs a warning naming only the exception type.
  expect(await received(health.bytes)).toEqual([]);
  expect((await received(ready.bytes)).map(({ path }) => path)).toEqual(["/v1/logs"]);
  expect(await received(ready.bytes, "Database readiness check failed", "InvalidOperationException")).toHaveLength(1);
  // OTEL_EXPORTER_OTLP_HEADERS reaches the backend, percent-decoded.
  for (const { authorization } of await received(invite.bytes)) expect(authorization).toBe(testAuthorization);
});

test("OTEL_RESOURCE_ATTRIBUTES sets the environment name, and the database pool is named without its host or username", async ({ request }) => {
  const environment = `loadtest-${randomUUID()}`;
  const username = `pool-user-${randomUUID()}`;
  // Nothing listens on port 1, so the readiness query fails, but it still creates the pool.
  const loadtest = await startApi(5129, {
    ...telemetry,
    OTEL_RESOURCE_ATTRIBUTES: `deployment.environment.name=${environment}`,
    ConnectionStrings__Database: `Host=127.0.0.1;Port=1;Database=offline;Username=${username};Password=placeholder`,
  });
  try {
    const response = await request.get(`${loadtest.baseURL}/health/ready`);
    expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    await expect.poll(async () => (await received(environment, "db.client.connection.pool.name", "specthread")).length).toBeGreaterThan(0);
    expect(await received(username)).toEqual([]);
  } finally {
    loadtest.stop();
  }
});

test("web spans keep only the scheme and host of URLs and drop raw paths and queries", () => {
  expect(redactText("fetch GET https://api.example/invites/abc?token=def#x")).toBe("fetch GET https://api.example");
  expect(redactText("failed: http://user:pass@127.0.0.1:5107/projects/1 (ECONNREFUSED)")).toBe("failed: http://127.0.0.1:5107 (ECONNREFUSED)");
  expect(redactText("GET /invites/[token]")).toBe("GET /invites/[token]");
  expect(redactAttributes({
    "http.target": "/invites/abc", "url.path": "/invites/abc", "url.query": "?token=abc", "resource.name": "/invites/abc",
    "http.url": "https://api.example/invites/abc", "next.route": "/invites/[token]", "http.status_code": 200,
    "list": ["https://a.example/x?y", "plain"],
  })).toEqual({
    "http.url": "https://api.example", "next.route": "/invites/[token]", "http.status_code": 200,
    "list": ["https://a.example", "plain"],
  });
});

test("web spans carry a keyed hash of the visitor's IP, never the IP, and no IP without a key", () => {
  type Headers = Record<string, string | string[] | undefined>;
  const getter = { keys: (carrier: Headers) => Object.keys(carrier), get: (carrier: Headers, key: string) => carrier[key] };
  const ip = "203.0.113.7";
  // Fixed value: the lookup command in docs/OBSERVABILITY.md gives the same result.
  expect(hashIp(ip, "key-one")).toBe("2908191852e916b3");
  expect(clientAddressFromHeaders("key-one")({ "x-real-ip": ip }, getter)).toEqual({ "client.address": "2908191852e916b3" });
  expect(clientAddressFromHeaders("key-one")({ "x-real-ip": [` ${ip} `] }, getter)).toEqual({ "client.address": "2908191852e916b3" });
  expect(hashIp(ip, "key-two")).not.toBe(hashIp(ip, "key-one"));
  expect(hashIp("203.0.113.8", "key-one")).not.toBe(hashIp(ip, "key-one"));
  expect(clientAddressFromHeaders(undefined)({ "x-real-ip": ip }, getter)).toBeUndefined();
  expect(clientAddressFromHeaders("   ")({ "x-real-ip": ip }, getter)).toBeUndefined();
  expect(clientAddressFromHeaders("key-one")({}, getter)).toBeUndefined();
});

test("OTEL_EXPORTER_OTLP_HEADERS is read as percent-encoded name=value pairs", () => {
  expect(parseHeaders("Authorization=Basic%20abc%3D%3D, X-Scope=team")).toEqual({ Authorization: "Basic abc==", "X-Scope": "team" });
  expect(parseHeaders(undefined)).toEqual({});
  expect(parseHeaders("broken,=nothing")).toEqual({});
});

test("an endpoint that is not an HTTP(S) URL stops the API from starting", async () => {
  await expect(startApi(5128, { ...telemetry, OTEL_EXPORTER_OTLP_ENDPOINT: "127.0.0.1:5126" })).rejects.toThrow(/exited/);
});
