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
