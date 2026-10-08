import { createServer } from "node:http";
import { createVerify } from "node:crypto";

// Test-only stand-in for the parts of GitHub's REST API that SpecThread calls. Tests never
// reach the real GitHub. A test describes what one user token can see, and may register
// faults for one token or for the app:
//
//   PUT    /__github/users/<token>   { installations: [{ id, appInstalled?, repositories: [{ id, owner, name, private? }] }] }
//   PUT    /__github/repositories/<id>/items
//                                    { items: [{ number, pull?, merged?, title, state, user?, created_at, updated_at, closed_at?,
//                                                additions?, deletions?, changed_files?, commits?: [commit] }] }
//   PUT    /__github/repositories/<id>/commits
//                                    { commits: [{ sha, message, login?, name?, date, additions?, deletions?, files? }] }
//   PUT    /__github/repositories/<id>/checks/<sha>
//                                    { runs?: [{ name, status, conclusion?, html_url?, completed_at? }], total_runs?,
//                                      statuses?: [{ context, state, target_url?, updated_at? }],
//                                      deny?: "runs" | "statuses" | "both" }   (403, as without the permission)
//   PUT    /__github/repositories/<id>/releases
//                                    { releases: [{ tag, name?, prerelease?, published_at, author?, sha,
//                                                   contains?: [sha], unknown?: [sha] }] }
//
// A commit nobody set checks for has none. A release's history includes its own commit and the
// commits in `contains`; comparing with a commit in `unknown` answers 404, as for a commit the
// repository no longer has. A pull request item may set `merge_sha`, its commit after merging.
//   POST   /__github/faults          { bearer: <token> | "app" | "installation", path, status?, body?, close?, times? }
//   DELETE /__github/faults?bearer=<token | app | installation>&path=<the same path>
//
// The app reads issues and pull requests with the installation token it is given here, so
// faults for those calls use the bearer "installation". Faults for "app" and "installation"
// are seen by every test, so their path must name one test's own installation or repository.
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
  const items = new Map();
  const commits = new Map();
  const checks = new Map();
  const releases = new Map();
  const commitJson = commit => ({
    sha: commit.sha, html_url: `https://github.com/acme/repo/commit/${commit.sha}`,
    commit: { message: commit.message, author: { name: commit.name ?? "Ada Lovelace", date: commit.date } },
    author: commit.login === null ? null : { login: commit.login ?? "ada" },
  });
  const installationToken = "ghs_test_installation_token";
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
        const repositoryItems = /^\/__github\/repositories\/(\d+)\/items$/.exec(url.pathname);
        if (request.method === "PUT" && url.pathname.startsWith("/__github/users/")) {
          users.set(decodeURIComponent(url.pathname.slice("/__github/users/".length)), JSON.parse(body).installations);
        } else if (request.method === "PUT" && repositoryItems) {
          items.set(Number(repositoryItems[1]), JSON.parse(body).items);
        } else if (request.method === "PUT" && /^\/__github\/repositories\/\d+\/commits$/.test(url.pathname)) {
          commits.set(Number(url.pathname.split("/")[3]), JSON.parse(body).commits);
        } else if (request.method === "PUT" && /^\/__github\/repositories\/\d+\/releases$/.test(url.pathname)) {
          releases.set(Number(url.pathname.split("/")[3]), JSON.parse(body).releases);
        } else if (request.method === "PUT" && /^\/__github\/repositories\/\d+\/checks\/[0-9a-f]{40}$/.test(url.pathname)) {
          checks.set(`${url.pathname.split("/")[3]}/${url.pathname.split("/")[5]}`, JSON.parse(body));
        } else if (request.method === "POST" && url.pathname === "/__github/faults") {
          const fault = JSON.parse(body);
          faults.push({ ...fault, path: new RegExp(fault.path) });
        } else if (request.method === "DELETE" && url.pathname === "/__github/faults") {
          const [bearer, path] = [url.searchParams.get("bearer"), url.searchParams.get("path")];
          for (let index = faults.length - 1; index >= 0; index--) {
            if (faults[index].bearer === bearer && (path === null || faults[index].path.source === new RegExp(path).source)) faults.splice(index, 1);
          }
        } else {
          return send(response, 404);
        }
        return send(response, 204);
      }

      const bearer = (request.headers.authorization ?? "").replace(/^Bearer /, "");
      const asApp = url.pathname.startsWith("/app/");
      const faultKey = asApp ? "app" : bearer === installationToken ? "installation" : bearer;
      const index = faults.findIndex(fault => fault.bearer === faultKey && fault.path.test(url.pathname));
      const fault = index === -1 ? null : faults[index];
      if (fault?.times !== undefined && --fault.times <= 0) faults.splice(index, 1);
      if (fault?.close) return void request.socket.destroy();
      if (fault?.status) return send(response, fault.status, fault.body);

      const access = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(url.pathname);
      if (access && request.method === "POST") {
        if (appClaims(bearer, publicKey)?.iss !== String(appId)) return send(response, 401, { message: "Bad credentials" });
        const installed = [...users.values()].flat().some(installation => installation.id === Number(access[1]) && installation.appInstalled !== false);
        return installed
          ? send(response, 201, { token: installationToken, expires_at: new Date(Date.now() + 3_600_000).toISOString() })
          : send(response, 404, { message: "Not Found" });
      }

      const releasePath = /^\/repositories\/(\d+)\/(releases\/tags|commits\/tags)\/(.+)$/.exec(url.pathname);
      if (releasePath && request.method === "GET") {
        if (bearer !== installationToken) return send(response, 401, { message: "Bad credentials" });
        const tag = decodeURIComponent(releasePath[3]);
        const found = (releases.get(Number(releasePath[1])) ?? []).find(entry => entry.tag === tag);
        if (!found) return send(response, 404, { message: "Not Found" });
        if (releasePath[2] === "commits/tags") return send(response, 200, commitJson({ sha: found.sha, message: `Release ${tag}`, date: found.published_at }));
        return send(response, 200, {
          tag_name: found.tag, name: found.name ?? null, prerelease: found.prerelease ?? false, created_at: found.published_at,
          published_at: found.published_at, author: found.author === null ? null : { login: found.author ?? "ada" },
          html_url: `https://github.com/acme/repo/releases/tag/${encodeURIComponent(found.tag)}`,
        });
      }
      const comparePath = /^\/repositories\/(\d+)\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/.exec(url.pathname);
      if (comparePath && request.method === "GET") {
        if (bearer !== installationToken) return send(response, 401, { message: "Bad credentials" });
        const [, repository, base, head] = comparePath;
        const found = (releases.get(Number(repository)) ?? []).find(entry => entry.sha === head);
        if (!found || (found.unknown ?? []).includes(base)) return send(response, 404, { message: "Not Found" });
        const status = base === head ? "identical" : (found.contains ?? []).includes(base) ? "ahead" : "diverged";
        return send(response, 200, { status, ahead_by: status === "identical" ? 0 : 1, behind_by: status === "diverged" ? 1 : 0, commits: [] });
      }

      const checkPath = /^\/repositories\/(\d+)\/commits\/([0-9a-f]{40})\/(check-runs|status)$/.exec(url.pathname);
      if (checkPath && request.method === "GET") {
        if (bearer !== installationToken) return send(response, 401, { message: "Bad credentials" });
        const set = checks.get(`${checkPath[1]}/${checkPath[2]}`) ?? {};
        const denied = set.deny === "both" || set.deny === (checkPath[3] === "status" ? "statuses" : "runs");
        if (denied) return send(response, 403, { message: "Resource not accessible by integration" });
        if (checkPath[3] === "check-runs") {
          const runs = set.runs ?? [];
          return send(response, 200, { total_count: set.total_runs ?? runs.length, check_runs: page(runs, url) });
        }
        const statuses = set.statuses ?? [];
        return send(response, 200, { state: "pending", total_count: statuses.length, statuses: page(statuses, url) });
      }

      const commitPath = /^\/repositories\/(\d+)\/commits\/([0-9a-f]+)$/.exec(url.pathname);
      if (commitPath && request.method === "GET") {
        if (bearer !== installationToken) return send(response, 401, { message: "Bad credentials" });
        const found = (commits.get(Number(commitPath[1])) ?? []).find(entry => entry.sha.startsWith(commitPath[2]));
        if (!found) return send(response, 422, { message: "No commit found for SHA" });
        const [additions, deletions] = [found.additions ?? 0, found.deletions ?? 0];
        return send(response, 200, {
          ...commitJson(found), stats: { additions, deletions, total: additions + deletions },
          files: Array.from({ length: found.files ?? 0 }, (_, index) => ({ filename: `file-${index}.ts` })),
        });
      }
      const pullCommits = /^\/repositories\/(\d+)\/pulls\/(\d+)\/commits$/.exec(url.pathname);
      if (pullCommits && request.method === "GET") {
        if (bearer !== installationToken) return send(response, 401, { message: "Bad credentials" });
        const found = (items.get(Number(pullCommits[1])) ?? []).find(entry => entry.pull && entry.number === Number(pullCommits[2]));
        return found ? send(response, 200, page(found.commits ?? [], url).map(commitJson)) : send(response, 404, { message: "Not Found" });
      }

      const item = /^\/repositories\/(\d+)\/(issues|pulls)\/(\d+)$/.exec(url.pathname);
      if (item && request.method === "GET") {
        if (bearer !== installationToken) return send(response, 401, { message: "Bad credentials" });
        const found = (items.get(Number(item[1])) ?? []).find(entry => entry.number === Number(item[3]));
        if (!found || (item[2] === "pulls" && !found.pull)) return send(response, 404, { message: "Not Found" });
        const base = {
          number: found.number, title: found.title, state: found.state, user: found.user === null ? null : { login: found.user ?? "octocat" },
          html_url: `https://github.com/acme/repo/${found.pull ? "pull" : "issues"}/${found.number}`,
          created_at: found.created_at, updated_at: found.updated_at, closed_at: found.closed_at ?? null,
        };
        if (item[2] === "pulls") {
          const listed = found.commits ?? [];
          return send(response, 200, {
            ...base, merged: found.merged ?? false, commits: found.commit_count ?? listed.length, additions: found.additions ?? 0,
            deletions: found.deletions ?? 0, changed_files: found.changed_files ?? 0, head: { sha: listed.at(-1)?.sha ?? "f".repeat(40) },
            merge_commit_sha: found.merged ? found.merge_sha ?? null : null,
          });
        }
        return send(response, 200, found.pull ? { ...base, pull_request: { url: "https://api.github.test/pull" } } : base);
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
