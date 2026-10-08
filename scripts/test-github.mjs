import { createServer } from "node:http";
import { createVerify } from "node:crypto";

// Test-only stand-in for the parts of GitHub's REST API that SpecThread calls. Tests never
// reach the real GitHub. A test describes what one user token can see, and may register
// faults for one token or for the app:
//
//   PUT    /__github/users/<token>   { installations: [{ id, appInstalled?, repositories: [{ id, owner, name, private? }] }] }
//   POST   /__github/faults          { bearer: <token> | "app", path, status?, body?, close?, times? }
//   DELETE /__github/faults?bearer=<token | app>
//
// A token nobody registered is answered with 401, like an expired GitHub token.

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

/** Verifies an RS256 app token against the test key and returns its claims, or null. */
function appClaims(token, publicKey) {
  const [header, payload, signature] = token.split(".");
  if (!signature) return null;
  try {
    if (JSON.parse(Buffer.from(header, "base64url").toString()).alg !== "RS256") return null;
    const verifier = createVerify("RSA-SHA256").update(`${header}.${payload}`);
    if (!verifier.verify(publicKey, Buffer.from(signature, "base64url"))) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return claims.exp * 1000 > Date.now() ? claims : null;
  } catch {
    return null;
  }
}

export function startFakeGitHub({ port, appId, publicKey }) {
  const users = new Map();
  const faults = [];
  const send = (response, status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body === undefined ? "" : JSON.stringify(body));
  };
  const page = (items, url) => {
    const size = Number(url.searchParams.get("per_page") ?? 30);
    const start = (Number(url.searchParams.get("page") ?? 1) - 1) * size;
    return items.slice(start, start + size);
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://github.test");
      const body = await readBody(request);

      if (url.pathname.startsWith("/__github/")) {
        if (request.method === "PUT" && url.pathname.startsWith("/__github/users/")) {
          users.set(decodeURIComponent(url.pathname.slice("/__github/users/".length)), JSON.parse(body).installations);
        } else if (request.method === "POST" && url.pathname === "/__github/faults") {
          const fault = JSON.parse(body);
          faults.push({ ...fault, path: new RegExp(fault.path) });
        } else if (request.method === "DELETE" && url.pathname === "/__github/faults") {
          const bearer = url.searchParams.get("bearer");
          for (let index = faults.length - 1; index >= 0; index--) if (faults[index].bearer === bearer) faults.splice(index, 1);
        } else {
          return send(response, 404);
        }
        return send(response, 204);
      }

      const bearer = (request.headers.authorization ?? "").replace(/^Bearer /, "");
      const asApp = url.pathname.startsWith("/app/");
      const index = faults.findIndex(fault => fault.bearer === (asApp ? "app" : bearer) && fault.path.test(url.pathname));
      const fault = index === -1 ? null : faults[index];
      if (fault?.times !== undefined && --fault.times <= 0) faults.splice(index, 1);
      if (fault?.close) return void request.socket.destroy();
      if (fault?.status) return send(response, fault.status, fault.body);

      const access = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(url.pathname);
      if (access && request.method === "POST") {
        if (appClaims(bearer, publicKey)?.iss !== String(appId)) return send(response, 401, { message: "Bad credentials" });
        const installed = [...users.values()].flat().some(installation => installation.id === Number(access[1]) && installation.appInstalled !== false);
        return installed
          ? send(response, 201, { token: "ghs_test_installation_token", expires_at: new Date(Date.now() + 3_600_000).toISOString() })
          : send(response, 404, { message: "Not Found" });
      }

      const installations = users.get(bearer);
      if (!installations) return send(response, 401, { message: "Bad credentials" });
      if (request.method === "GET" && url.pathname === "/user/installations") {
        return send(response, 200, { total_count: installations.length, installations: page(installations, url).map(({ id }) => ({ id })) });
      }
      const repositories = /^\/user\/installations\/(\d+)\/repositories$/.exec(url.pathname);
      if (repositories && request.method === "GET") {
        const installation = installations.find(item => item.id === Number(repositories[1]));
        if (!installation) return send(response, 404, { message: "Not Found" });
        return send(response, 200, {
          total_count: installation.repositories.length,
          repositories: page(installation.repositories, url).map(item => ({
            id: item.id, name: item.name, private: item.private ?? false, owner: { login: item.owner },
          })),
        });
      }
      send(response, 404, { message: "Not Found" });
    } catch (error) {
      console.error("Fake GitHub failed", error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
