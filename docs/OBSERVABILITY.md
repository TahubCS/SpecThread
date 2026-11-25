# Observability

The web app and API can send traces, metrics, and logs over OpenTelemetry (OTLP/HTTP) to
Grafana Cloud in deployment, or to a local viewer while developing (ADR-055). Telemetry is
**off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set**, so local runs, tests, and CI behave as
if it did not exist.

## What is recorded

| Service | Signals | Highlights |
|---|---|---|
| `specthread-web` (Next.js, `@vercel/otel`) | Traces | One root span per request, named by route pattern (`GET /invites/[token]`); spans for outgoing `fetch` calls; `client.address` (a keyed hash of the IP) on Vercel; `user.id` on the page-gate span when signed in |
| `specthread-api` (ASP.NET Core, OpenTelemetry .NET) | Traces, metrics, logs | One span per request named by route template (`GET /projects/{projectId:guid}`) with `user.id`; a span per SQL statement (Npgsql) and per outgoing HTTP call (GitHub); request duration, Npgsql pool, Kestrel, HttpClient, and runtime metrics; `ILogger` warnings and errors from the framework, and every SpecThread log, linked to the trace |

The web app passes the trace to the API in the `traceparent` header, so one page load is one
trace: web route, API route, SQL. Only the API origin (`SPECTHREAD_API_URL`) receives that
header. Every signal carries `service.version` (the deployed commit: `VERCEL_GIT_COMMIT_SHA`
on Vercel, `RENDER_GIT_COMMIT` on Render) and `deployment.environment.name`. On the API that
is the ASP.NET environment in lower case (`production`), unless `OTEL_RESOURCE_ATTRIBUTES`
sets it: a load-test run uses `OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=loadtest`.
The Npgsql pool metrics and SQL spans name the database `specthread`
(`db.client.connection.pool.name`, `db.npgsql.data_source`), not the connection string.

`/health` and `/health/ready` (ADR-061) requests are counted in metrics but not traced,
because Render checks `/health` every few seconds and the uptime checks call `/health/ready`.
A failed readiness check logs a warning with the exception type only. The web app sends traces only; its console output stays in Vercel's own logs, which
the Hobby plan keeps for about an hour.

## Never recorded

The guard tests (docs/TESTING.md) fail if any of these appear in what is sent. If a change
makes them fail, fix the redaction; do not loosen the test.

- Tokens and secrets: invitation and password-reset tokens, JWTs, session cookies, API keys.
- Emails and names, including an email typed into a failed sign-in.
- Request or response bodies, document contents, and headers.
- Raw URL paths and query strings. The API replaces `url.path` with the route template (or
  drops it when no route matched); the web app removes `http.target`, `url.path`, `url.query`,
  and `resource.name`, and cuts every URL in span names, attributes, events, and status
  messages down to its scheme and host.
- SQL parameter values (Npgsql leaves them out by default).
- User IDs, team IDs, or IP addresses as **metric** labels. Each distinct value is a separate
  time series, and the free tier allows 10,000. They belong on traces only.

The caller is identified by `user.id`, the Better Auth user ID from the JWT `sub` (API) or the
session (web). Raw IP addresses are never sent (ADR-060). The web root span's `client.address`
holds the first 16 hex characters of an HMAC-SHA256 of Vercel's `x-real-ip` header, keyed with
`TELEMETRY_IP_HASH_KEY`. The same IP always gives the same value, so requests can still be
grouped by source, but the address can't be read back without the key. `@vercel/otel` reads
headers only when running on Vercel, and with no key set no IP value is recorded. User IDs and
hashed IPs are still personal data: they are kept as long as the backend's retention (14 days
on Grafana Cloud's free tier) and the privacy page says so.

## Local viewer

Optional. Requires Docker Desktop, which `npm test` already needs.

```sh
npm run observability:up     # grafana/otel-lgtm: Grafana, Tempo, Loki, Prometheus
```

Open Grafana at http://localhost:3030. Point your dev servers at it, then restart them:

```sh
# Web: add to app/web/.env.local
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
# API: once
dotnet user-secrets set "OTEL_EXPORTER_OTLP_ENDPOINT" "http://127.0.0.1:4318" --project app/api
```

Load a page, then in Grafana open **Explore > Tempo** and search for service `specthread-web`.
Metrics are under **Explore > Prometheus** (exported every 60 seconds), and API logs under
**Explore > Loki**. When finished, `npm run observability:down`; nothing is kept. Leaving the
two settings in place is harmless: while the viewer is down the dev servers run normally and
their exports fail quietly. Remove them to stop sending.

While developing, open the trace of the page you changed: check how many queries it runs and in
what order, and that nothing from the list above appears in its attributes.

## Deployed telemetry

Grafana Cloud's free tier receives production telemetry. The Grafana owner holds the stack and
its tokens; the platform owner sets the variables in DEPLOYMENT.md on Vercel (Production only)
and Render. Rollback: delete `OTEL_EXPORTER_OTLP_ENDPOINT` on both platforms and redeploy.

| Variable | Value |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The stack's OTLP endpoint, for example `https://otlp-gateway-prod-us-west-0.grafana.net/otlp`. Empty or unset turns telemetry off. On the API, any other value that is not an HTTP(S) URL stops startup |
| `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic%20<base64 of instanceId:token>`. **Secret.** The space is written `%20` |
| `TELEMETRY_IP_HASH_KEY` | Vercel only. Random key for hashing IPs (`openssl rand -hex 32`). **Secret.** Unset means no IP value is recorded |

Nothing else is needed: the protocol is always OTLP over HTTP with protobuf, and service names
and environment come from the code and the platform.

**Metric series budget.** The free tier allows 10,000 active series. After the whole browser
suite ran against the local viewer (2026-10-30), the API had sent about 2,100; the web app
sends no metrics. The local viewer also builds about 5,000 series of its own from traces
(`traces_spanmetrics_*`). Grafana Cloud builds those only when Application Observability is
turned on, which would count against the same limit, so leave it off unless the budget is
checked again. If a change adds instruments or many routes, recheck with
`count({__name__=~".+"})` in the local viewer.

## Finding what an account or IP did

In Grafana, **Explore > Tempo**, query type TraceQL:

```text
{ span.user.id = "<user id>" }                                   # everything one user did
{ span.client.address = "<hashed ip>" }                          # everything from one IP
{ resource.service.name = "specthread-api" && span.http.response.status_code >= 500 }
```

To look up an IP, hash it with the production key (kept in the team password manager) and
search for the result:

```sh
node -e "console.log(require('crypto').createHmac('sha256', process.argv[1]).update(process.argv[2]).digest('hex').slice(0, 16))" "<TELEMETRY_IP_HASH_KEY>" 203.0.113.7
```

Going the other way, from a hash to an IP, isn't possible. Changing the key changes every
hash, so traces from before and after a key change don't match.

Traces hold only the user ID. To see whose it is, someone with database access runs, in the
Supabase SQL editor, `select id, email, name from "user" where id = '<user id>';` (or
`where email = '...'` to go the other way). Exports of traces (Grafana's Download as JSON)
contain IDs and hashed IPs: keep them team-only.

## Adding code

- Instrumentation is automatic: new routes, pages, SQL, and `HttpClient` or `fetch` calls are
  traced with no extra code. Add a manual span only for meaningful work that is not an HTTP or
  SQL call.
- The first custom API signal adds an `ActivitySource` and `Meter` named `SpecThread.Api` in
  `app/api/Observability` and registers them with `AddSource` and `AddMeter`. Name metrics
  `specthread.<area>.<measure>` with a unit (for example `specthread.evidence.refresh.duration`
  in seconds). Span attributes for product IDs are named `specthread.<thing>_id` and never go
  on metrics.
- PR checklist: if a change adds a route, an external call, or background work, open its trace
  locally.
