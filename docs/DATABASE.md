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

`SpecThreadDbContext` maps six Better Auth tables and eight product tables in
`public`, with the InitialSchema, AuthRateLimits, Teams, TeamNavigationOnboarding,
TeamProjects, and TeamInvitations migrations. Startup never calls `EnsureCreated`, `Migrate`, or a database
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
policies. Privileged server connections need C# authorization, which is now
implemented for project reads/writes and team creation/member-only reads.
Forward SQL is in schema/initial.sql; rollback.sql drops all nine tables and
their data. These scripts are not idempotent. Do not rerun the one-time
`npm run schema:generate` against the existing migration. Future changes need
new EF migrations. See DEPLOYMENT.md for web TLS/CA configuration.

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

## Teams migration (first slice)

Teams adds `public.teams` and `public.team_members`. A team has one owner user ID;
the API derives the Owner role from that field, and other membership roles are
Admin or Member. Foreign keys preserve existing accounts, and the composite
membership key prevents duplicates. Both tables enable RLS with no allow policies;
grants to PUBLIC, anon, and authenticated are revoked. C# checks membership for
every product read rather than relying on a Supabase user JWT in EF connections.

Generate and reproduce the artifacts without connecting to a database:

```sh
dotnet ef migrations add Teams --project app/api
node scripts/generate-teams.mjs
```

The generator appends explicit RLS/grant SQL to the generated migration and writes
`schema/teams.sql` and `schema/teams-rollback.sql`. Rerun only the generator after
the migration exists; do not scaffold the same migration twice. Tests apply the
forward SQL in disposable PostgreSQL and exercise rollback/reapply.

Before deploying this slice, initialize EF, review the migration/SQL, inspect the
target history, and apply `dotnet ef database update Teams --project app/api` to
the intended database. This task does not apply it to shared Supabase. Deploy the
API before the web and configure `SPECTHREAD_API_URL` and matching issuer origins.
Back up team data before rollback. First revert the web/API team functionality,
then `dotnet ef database update AuthRateLimits --project app/api`; rollback drops
only teams and team memberships, preserving existing auth and project data.

## Team navigation and onboarding migration

TeamNavigationOnboarding adds `is_favorite` and `is_expanded` to memberships,
and a private `user_onboarding` completion record keyed by account. Existing team
members are backfilled as completed, using their earliest membership timestamp.
New first-team creation saves completion with the team/member transaction.
Completion does not depend on having a membership forever. No Better Auth column
is added or modified.

```sh
dotnet ef migrations add TeamNavigationOnboarding --project app/api
node scripts/generate-team-navigation.mjs
```

The generator adds the backfill/RLS/revoked-grant SQL and writes
`schema/team-navigation.sql` and `schema/team-navigation-rollback.sql` offline.
Review history and SQL before applying `dotnet ef database update
TeamNavigationOnboarding --project app/api`. This work applies migrations only to
disposable tests, not shared Supabase.

Rollback to Teams preserves teams, members, auth, and projects, but removes
completion and navigation preferences. Revert the web/API onboarding gate before
rollback. Reapplying marks existing members completed; accounts that completed
onboarding then left every team need their backed-up completion state restored.
Back up these preferences and completion records before rollback.

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


## Team-owned projects migration

TeamProjects adds the required `projects.team_id` FK to teams, with restricted
team deletion. Before the FK is created, each existing project gets a separate
team bearing its name; its owner and existing project members become that team's
Owner and Members. Owner membership is supplied if an old project lacks it.
Membership join timestamps, projects, requirements, criteria, and legacy membership
rows are preserved. Legacy collaborators are backfilled as onboarded. No unrelated
projects are combined. New authorization reads only team membership; legacy
project_members remains historical data for rollback and grants no access.

```sh
dotnet ef migrations add TeamProjects --project app/api
node scripts/generate-team-projects.mjs
```

The generator inserts the agreed backfill before the generated FK/index, removes
the temporary column default, and emits `schema/team-projects.sql` and
`schema/team-projects-rollback.sql` offline. Rerun the generator only once the
migration exists. Tests use isolated Docker databases; no shared migration is run.

Before deployment, back up the target, inspect history, initialize EF, and apply
`dotnet ef database update TeamProjects --project app/api`. Deploy the matching API
before the web. Rollback to TeamNavigationOnboarding drops only the project/team
association and preserves generated teams and all project/auth/requirement data.
It does not recreate individual memberships for projects created after migration,
or reproduce team role changes in the old model. Reverting authorization requires
an explicit access reconciliation from a backup. Reapplication creates new teams
per project and does not reuse the preserved teams; prefer rolling forward once
new team-owned data exists. Do not apply the full initial rollback.

## Team invitations migration

TeamInvitations adds `public.team_invitations`: team/email/role/issuer, hashed
secret, creation/issue/expiry timestamps, and acceptance/revocation state. Team and
auth-user foreign keys restrict deletion. Check constraints limit role and expiry
and prevent simultaneous acceptance/revocation. A unique digest index supports
token lookup; a partial unique team/email index permits only one unresolved invite
per recipient. Expired unresolved invitations must be resent or revoked. RLS and
revoked PUBLIC/anon/authenticated grants keep all access on the authorized API.

```sh
dotnet ef migrations add TeamInvitations --project app/api
node scripts/generate-team-invitations.mjs
```

The generator adds the RLS/grant guard and emits `schema/team-invitations.sql` and
`schema/team-invitations-rollback.sql` offline. After initialization, backup, and
history review, the rollout target is `dotnet ef database update TeamInvitations
--project app/api`. Only disposable databases are migrated during development.
Rollback to TeamProjects drops invitation records, invalidating pending links;
it preserves teams, accepted memberships, onboarding completion, projects, and auth.
Reapplication creates empty invitation storage. Back up invitation history before
rollback; hashes cannot recover plaintext links. Prefer rolling forward.
