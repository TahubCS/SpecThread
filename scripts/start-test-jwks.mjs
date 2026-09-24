// Test-only stand-in for Better Auth's JWKS endpoint, used by the api Playwright
// project. Keys are generated per run and never written to disk. Loopback only.
import { createServer } from "node:http";
import { createHmac, generateKeyPairSync, sign } from "node:crypto";

const host = "127.0.0.1";
const port = 5101;
const issuer = `http://${host}:${port}`;
const kid = "test-published";
const keys = {
  published: generateKeyPairSync("ec", { namedCurve: "P-256" }),
  unpublished: generateKeyPairSync("ec", { namedCurve: "P-256" }),
};
const jwks = { keys: [{ ...keys.published.publicKey.export({ format: "jwk" }), alg: "ES256", kid }] };

const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");

// Mints a token. `claims` and `header` override the Better Auth-shaped defaults;
// A null claim is omitted. `key` is "published" (default), "unpublished", "hs256", or "none".
function mint({ claims = {}, header = {}, key = "published" }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Object.fromEntries(Object.entries({ iss: issuer, aud: issuer, sub: "test-user", iat: now, exp: now + 900, ...claims })
    .filter(([, value]) => value !== null));
  const alg = key === "hs256" ? "HS256" : key === "none" ? "none" : "ES256";
  const input = `${encode({ alg, kid, ...header })}.${encode(payload)}`;
  if (key === "none") return `${input}.`;
  if (key === "hs256") return `${input}.${createHmac("sha256", "test-only-hmac-secret").update(input).digest("base64url")}`;
  const signature = sign("sha256", Buffer.from(input), { key: keys[key].privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}

createServer((request, response) => {
  if (request.method === "GET" && request.url === "/api/auth/jwks") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(jwks));
    return;
  }
  if (request.method === "POST" && request.url === "/sign") {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      try {
        const options = JSON.parse(body || "{}");
        if (options.key && !["published", "unpublished", "hs256", "none"].includes(options.key)) throw new Error("Unknown key");
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ token: mint(options) }));
      } catch {
        response.writeHead(400).end();
      }
    });
    return;
  }
  response.writeHead(404).end();
}).listen(port, host);
