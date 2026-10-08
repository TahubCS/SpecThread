# Database foundation

Use ASP.NET Core 10 + EF Core 10 + Npgsql with PostgreSQL hosted on Supabase.
EF Core owns application schema migrations. Drizzle is not installed or used.

## Initialize before database execution

From the repository root:

```sh
dotnet restore app/api --locked-mode
dotnet tool restore
dotnet build app/api --configuration Release
```

`SpecThreadDbContext` maps six Better Auth tables and four product tables in
`public`, with the InitialSchema and AuthRateLimits migrations. Startup never calls `EnsureCreated`, `Migrate`, or a database
query. `/health` checks process liveness only. Resolving the context without
`ConnectionStrings:Database` fails explicitly. Playwright verifies this failure
and provider initialization with dummy credentials, without a database connection.

## Configure live access when persistence work begins

Get the connection details from the Supabase project's **Connect** dialog.
Use a direct connection for a persistent API with IPv6 connectivity, or the
session pooler for an IPv4-only host. Copy the actual host and username from
the dashboard. Use TLS certificate verification (`SSL Mode=VerifyFull`).
On Windows the Supabase root CA is not trusted by default, so the API fails with
"Exception while performing SSL handshake". Add
`Root Certificate=<absolute path to app/api/certs/prod-ca-2021.crt>` to the local
connection string. Render does not need it (docs/DEPLOYMENT.md).

Store the Npgsql connection string in .NET user-secrets under
`ConnectionStrings:Database` for development, or in the API host's environment
as `ConnectionStrings__Database`. The API `.env.example` documents the format;
ASP.NET does not automatically load `.env` files. Better Auth has separate,
server-only web database configuration for authentication tables (ADR-008).
Never put database credentials in a `NEXT_PUBLIC_` variable. MCP OAuth does not supply an API
database password.

With configuration set, `dotnet ef dbcontext info --project app/api` verifies
context construction, not live credentials or connectivity. No live Supabase
database check is included in this foundation.

## Future migrations

Agree on the first feature's model, authorization, and API contract first.
Generate migrations using `dotnet ef migrations add <Name> --project app/api`.
Review the generated migration and SQL before applying it. Document the target,
backup needs, and rollback. Prefer a direct connection for migration execution;
consult Supabase's connection guidance for IPv4-only environments.

Do not run `database update`, ad-hoc MCP SQL, or schema edits before EF Core is
initialized and the intended schema change is reviewed. Do not introduce a
second Supabase CLI or Drizzle migration history. Do not map or alter Supabase's
managed `auth` or `storage` schemas. Tables exposed through the Supabase Data API
require RLS and intentional grants/policies as part of their migrations. Direct
EF connections do not automatically carry a Supabase user's JWT; the API's
authorization model must be designed explicitly.

The previous handoff records InitialSchema as applied to Supabase. Its nine
tables have RLS enabled and browser-role privileges revoked, with no allow
policies. This does not implement project authorization for privileged server
connections. C# JWT validation and membership checks remain outstanding.
Forward SQL is in schema/initial.sql; rollback.sql drops all nine tables and
their data. These scripts are not idempotent. Do not rerun the one-time
`npm run schema:generate` against the existing migration. Future changes need
new EF migrations. See DEPLOYMENT.md for web TLS/CA configuration.

## Supabase MCP for Codex

## Auth rate-limit migration

AuthRateLimits adds public."rateLimit" with Better Auth 1.7.5's text id/key,
integer count, and bigint lastRequest (milliseconds). A unique key index supports
concurrent bucket creation; a lastRequest index supports stale-row cleanup.
RLS is enabled with no allow policies; PUBLIC, anon, and authenticated grants
are revoked. The server database role must retain access.

Generation commands (offline connection settings suffice):

```sh
dotnet ef migrations add AuthRateLimits --project app/api
node scripts/generate-auth-rate-limits.mjs
```

The second command appends the explicit RLS statements and generates
docs/schema/auth-rate-limits.sql and auth-rate-limits-rollback.sql. It can be
rerun to regenerate these artifacts; do not rerun the initial-schema generator.
Existing initial/rollback scripts remain the historical InitialSchema pair.

Before live execution, initialize EF and inspect migration history. Apply
AuthRateLimits before deploying database-backed rate limiting. Rollback requires
reverting the web app to memory storage first, then running
`dotnet ef database update InitialSchema --project app/api`. This drops only rate
limit counters, resetting throttles; it preserves users, sessions, and product
data. Never apply the full initial rollback to undo this change.

## Project repositories migration

ProjectRepositories adds public.project_repositories: one row per project with the
GitHub installation and repository IDs, the owner and name at connection time, and
who connected it and when (ADR-032). RLS is enabled with no allow policies; PUBLIC,
anon, and authenticated grants are revoked. It does not change any existing table.

Generation commands (offline connection settings suffice):

```sh
dotnet ef migrations add ProjectRepositories --project app/api --configuration Release
node scripts/generate-project-repositories.mjs
```

The second command appends the RLS statements and generates
docs/schema/project-repositories.sql and project-repositories-rollback.sql. It can
be rerun.

Apply it before deploying an API that has the repository endpoints, and deploy that
API before the web app that calls them. With the API stopped and
`ConnectionStrings:Database` set, run
`dotnet ef database update ProjectRepositories --project app/api`, or run
docs/schema/project-repositories.sql once in the Supabase SQL editor. Rollback:
`dotnet ef database update AuthRateLimits --project app/api`, or the rollback
script. It drops only the repository connections, which owners can recreate.

## Requirement evidence migration

RequirementEvidence adds public.requirement_evidence: one row per issue or pull
request linked to a requirement, with what GitHub reported when it was last read
(ADR-033). A unique index allows each item once per requirement. RLS is enabled with
no allow policies; PUBLIC, anon, and authenticated grants are revoked. It changes no
existing table and depends on ProjectRepositories only for ordering.

```sh
dotnet ef migrations add RequirementEvidence --project app/api --configuration Release
node scripts/generate-requirement-evidence.mjs
```

Apply it after ProjectRepositories and before deploying an API with the evidence
endpoints: with the API stopped, `dotnet ef database update RequirementEvidence
--project app/api`, or run docs/schema/requirement-evidence.sql once in the Supabase
SQL editor. Rollback: `dotnet ef database update ProjectRepositories --project
app/api`, or requirement-evidence-rollback.sql. It deletes every evidence link;
members can link the items again, but who linked them and when is lost.

## Evidence commits migration

EvidenceCommits changes public.requirement_evidence so a row can be a commit
(ADR-034): `number` and `state` become optional; `sha`, `additions`, `deletions`,
`changed_files`, `commit_count`, and `commits` (jsonb) are added; check constraints
require a commit to have a 40-digit SHA and no number or state, and an issue or pull
request to have a number and a state; a unique index allows each commit once per
requirement. Existing rows stay valid. RLS and grants on the table are unchanged.

```sh
dotnet ef migrations add EvidenceCommits --project app/api --configuration Release
node scripts/generate-evidence-commits.mjs
```

The second command adds one statement to the migration's rollback, which deletes
commit links before the old constraints return, and generates
docs/schema/evidence-commits.sql and evidence-commits-rollback.sql.

Apply it after RequirementEvidence: with the API stopped,
`dotnet ef database update --project app/api` applies every pending migration in
order; or run the SQL scripts in order in the Supabase SQL editor. Rollback:
`dotnet ef database update RequirementEvidence --project app/api`, or the rollback
script. It deletes every commit link and the stored changes and commits of pull
requests, and leaves `number` and `state` with empty defaults that the original
migration did not have.

## Evidence checks migration

EvidenceChecks adds four columns to public.requirement_evidence: `checks` (jsonb),
`check_count`, and `checks_read_at` for check results (ADR-035), and `source`
(`manual` or `suggested`, default `manual`) for how the link came to be (ADR-036).
Existing rows become `manual`. No table is added, so RLS and grants are unchanged.

```sh
dotnet ef migrations add EvidenceChecks --project app/api --configuration Release
node scripts/generate-evidence-checks.mjs
```

Apply it after EvidenceCommits: with the API stopped,
`dotnet ef database update --project app/api`, or run
docs/schema/evidence-checks.sql in the Supabase SQL editor. Rollback:
`dotnet ef database update EvidenceCommits --project app/api`, or
evidence-checks-rollback.sql. It drops the stored check results and the source
marker; the links themselves stay.

## Supabase tooling

```sh
codex mcp add supabase --url "https://mcp.supabase.com/mcp?project_ref=hgcjtecsglksdbsmtcxt&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
codex mcp login supabase
codex mcp list
```

This machine's global configuration is authenticated with OAuth. Automatic scope
discovery failed during setup; this explicit supported-scope login succeeded:

```sh
codex mcp login supabase --scopes "organizations:read,projects:read,projects:write,database:read,database:write,analytics:read,edge_functions:read,edge_functions:write,environment:read,environment:write"
```

Each teammate authenticates independently. Reload Codex if new tools do not
appear in an existing session. `/mcp` is an interactive Codex command; CLI
verification uses `codex mcp list`. Never commit OAuth tokens. The Supabase skill
was already installed, so the optional duplicate skill installation was skipped.

References: [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Npgsql EF provider](https://www.npgsql.org/efcore/), and
[Codex MCP](https://developers.openai.com/codex/mcp).
