import { createServer } from "node:http";

// Test-only OTLP/HTTP receiver. The test web app and API send telemetry here, and tests read
// back what arrived, so they can check that a trace crosses web -> API and that no secret is
// ever sent. OTLP protobuf stores strings as raw UTF-8 and IDs as raw bytes, so tests search the
// bytes without decoding them.
//
//   POST /v1/traces | /v1/metrics | /v1/logs   (from the OpenTelemetry exporters)
//   GET  /__otlp/requests?contains=<hex>&...   requests whose body contains every given byte string,
//        as [{ path, authorization, body (base64) }]
//
// Only the most recent requests are kept, which is plenty for one test run.

const limit = 5000;

export function startFakeOtlp({ port }) {
  const received = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://otlp");
      if (request.method === "POST" && url.pathname.startsWith("/v1/")) {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        received.push({ path: url.pathname, authorization: request.headers.authorization ?? null, body: Buffer.concat(chunks) });
        if (received.length > limit) received.splice(0, received.length - limit);
        // An empty body is a valid, empty Export*ServiceResponse.
        response.writeHead(200, { "content-type": "application/x-protobuf" }).end();
        return;
      }
      if (request.method === "GET" && url.pathname === "/__otlp/requests") {
        const needles = url.searchParams.getAll("contains").map(hex => Buffer.from(hex, "hex"));
        const matches = received.filter(({ body }) => needles.every(needle => body.includes(needle)));
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(
          matches.map(({ path, authorization, body }) => ({ path, authorization, body: body.toString("base64") }))));
        return;
      }
      response.writeHead(404).end();
    } catch (error) {
      console.error("Fake OTLP receiver failed", error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
