import { createServer } from "node:http";

// Test-only proxy between the test web app and the test API. It forwards every request
// unless a browser test has registered a fault for that user, so tests can make the API
// fail, stall, or answer wrongly for one user without affecting tests running in parallel.
//
//   POST   /__faults  { sub, method, path, status?, body?, close?, delayMs?, times? }
//   DELETE /__faults?sub=<user id>
//
// `path` is a regular expression matched against the request path. `status` with an optional
// JSON `body` answers instead of the API; `close` drops the connection; `delayMs` alone
// delays and then forwards. A fault applies `times` times (default: until deleted).

const hopByHop = new Set(["connection", "content-length", "host", "keep-alive", "transfer-encoding"]);

/** Reads the user ID from a bearer token without verifying it. The API still verifies every forwarded token. */
function subjectOf(authorization) {
  try {
    return JSON.parse(Buffer.from(String(authorization).split(".")[1], "base64url").toString()).sub ?? null;
  } catch {
    return null;
  }
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export function startApiProxy({ port, upstream }) {
  const faults = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://proxy");
      const body = await readBody(request);
      if (url.pathname === "/__faults") {
        if (request.method === "POST") {
          const fault = JSON.parse(body.toString());
          if (typeof fault.sub !== "string" || typeof fault.method !== "string" || typeof fault.path !== "string") {
            response.writeHead(400).end();
            return;
          }
          faults.push({ ...fault, path: new RegExp(fault.path) });
        } else if (request.method === "DELETE") {
          const sub = url.searchParams.get("sub");
          for (let index = faults.length - 1; index >= 0; index--) if (faults[index].sub === sub) faults.splice(index, 1);
        }
        response.writeHead(204).end();
        return;
      }

      const sub = subjectOf(request.headers.authorization);
      const index = faults.findIndex(fault => fault.sub === sub && fault.method === request.method && fault.path.test(url.pathname));
      const fault = index === -1 ? null : faults[index];
      if (fault?.times !== undefined && --fault.times <= 0) faults.splice(index, 1);
      if (fault?.delayMs) await new Promise(resolve => setTimeout(resolve, fault.delayMs));
      if (fault?.close) {
        request.socket.destroy();
        return;
      }
      if (fault?.status) {
        const problem = fault.status >= 400;
        response.writeHead(fault.status, { "content-type": problem ? "application/problem+json" : "application/json" });
        response.end(fault.body === undefined ? "" : JSON.stringify(fault.body));
        return;
      }

      const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !hopByHop.has(name)));
      const forwarded = await fetch(new URL(request.url, upstream), {
        method: request.method, headers, body: body.length ? body : undefined, redirect: "manual",
      });
      const answer = Buffer.from(await forwarded.arrayBuffer());
      const answerHeaders = {};
      for (const name of ["content-type", "location", "www-authenticate"]) {
        const value = forwarded.headers.get(name);
        if (value) answerHeaders[name] = value;
      }
      response.writeHead(forwarded.status, answerHeaders).end(answer);
    } catch (error) {
      console.error("Test API proxy failed", error);
      if (!response.headersSent) response.writeHead(502);
      response.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
