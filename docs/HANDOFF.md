# Shared handoff

## Current state

- Task: establish the approved Next.js/.NET/Supabase foundation.
- Branch: `main`, explicitly requested by the user. No branch created, commits
  made, or pushes performed for this task.
- Web: existing Next.js 16.3.5 application moved to `app/web` with source and
  assets preserved byte-for-byte according to Git blob hashes.
- API: ASP.NET Core 10 in `app/api`, SDK 10.0.401, nullable checks and warnings
  as errors. `GET /health` returns `{ "status": "ok" }`; development exposes
  `/openapi/v1.json`.
- Database: Supabase PostgreSQL, with EF Core 10 and Npgsql initialized as the
  sole ORM/migration system. Drizzle was explicitly replaced with user approval.
- EF context has no entities or migrations. Startup and health checks never query
  or modify a database. No live Supabase database query or migration was executed.
- Supabase MCP is configured globally for project `hgcjtecsglksdbsmtcxt` and
  authenticated. `codex mcp login` succeeded; `codex mcp list` reports enabled/OAuth.
- Pending branch-permission edits in AGENTS.md and WORKFLOW.md were preserved.
  Ask permission before each new task branch; remain on the current branch when
  chosen, and retain that choice throughout follow-up work.

## Completed work and changed files

- Moved `src/`, `public/`, `next.config.ts`, `postcss.config.mjs`, and the web
  TypeScript configuration into `app/web`; added its package manifest and env
  example. Root package.json and package-lock.json now define a single npm workspace.
- Added `app/api/Program.cs`, `Data/SpecThreadDbContext.cs`, project file,
  generated NuGet lockfile, and placeholder-only environment example.
- Added `global.json` and generated `dotnet-tools.json` with dotnet-ef 10.0.12.
- Updated root TypeScript, ESLint, Git ignore, npm scripts, and Playwright config.
- Added HTTP health/OpenAPI/404 tests and EF initialization/missing-config tests
  under `tests/api/`; retained the existing Chromium homepage smoke test.
- Added `.github/workflows/ci.yml` using the documented local checks.
- Renamed `docs/PROJECTS.md` to `docs/PROJECT.md` to match existing references.
- Updated README, AGENTS.md, ARCHITECTURE.md, WORKFLOW.md, TESTING.md, and
  DECISIONS.md (ADR-006/007). Added DATABASE.md and refreshed this handoff.
- Optional duplicate Supabase skills installation skipped: the Supabase skill
  is already installed. No application dependency on the Supabase client SDK.

## Decisions and remaining boundaries

- Approved layout is singular `app/web` and `app/api`.
- Node.js 24/npm 11; existing web dependency versions retained. One npm lockfile.
- EF and OpenAPI packages are 10.0.12; Npgsql EF provider is 10.0.3. Versions
  were checked against NuGet; the generated lockfile pins transitive dependencies.
- New API dependencies provide OpenAPI, PostgreSQL EF access, and design-time
  migration tooling. No product models, authentication, or repository integrations.
- EF must be initialized before database execution. No automatic startup migration
  or database creation. Supabase-managed schemas remain outside application ownership.
- Docker Compose deferred because no current check needs a database.
- Authentication, API deployment provider, GitHub App/OAuth choice, first feature
  contract/schema, and team merge policy still need agreement.

## Verification

- `npm install`: passed; regenerated workspace lockfile.
- `npm ci`: passed; 368 packages installed, audit reported 0 vulnerabilities.
- `dotnet restore app/api --locked-mode`: passed.
- `dotnet tool restore`: passed, dotnet-ef 10.0.12 restored.
- `dotnet build app/api --configuration Release --no-restore`: passed,
  zero warnings and errors.
- `dotnet format app/api --verify-no-changes --no-restore`: passed.
- Initial `npm run lint` and `npm run typecheck`: passed after the move.
- Initial `npm test`: 4 passed (homepage and three HTTP API checks), including
  web production build and managed server startup.
- `dotnet ef dbcontext info --project app/api --configuration Release --no-build
  --json`: passed with dummy localhost port 1 credentials; Npgsql provider confirmed
  without opening a database connection.
- Final `npm run lint` and `npm run typecheck`: passed. Root `npx tsc --noEmit`
  also passed after the final test assertion edit.
- `npm test -- --list`: passed, six tests discovered across three files.
- Final `npm test`: six passed in 17.8 seconds, including production web and
  Release API builds. An initial missing-config assertion checked the Node error
  message; it was corrected to check EF CLI stdout and the expected nonzero exit.
- `git diff --check`: passed. Final diff and added files reviewed for scope,
  generated artifacts, credentials, and duplicate configuration.
- Moved source/assets verified against HEAD hashes. Generated .next, bin, obj,
  reports, and test results remain ignored. No real credentials added to the repo.
- Supabase automatic OAuth discovery initially failed with unsupported scopes.
  Explicit supported scopes succeeded after user browser authorization.
- A final-check attempt was blocked by approval-review usage limits. The user
  requested continuation and the retry was accepted.

## Limits and exact next step

Live database credentials/connectivity, migrations, production API hosting, the
interactive `/mcp` panel, and the GitHub-hosted CI run have not been verified.
Existing Codex sessions may need reload to expose the newly added MCP tools.
The web build needs Google Fonts network access. npm reports the existing ESLint
9.39.5 as deprecated; upgrading unrelated framework tooling was left out of scope.

Review and commit the locally verified baseline on main, then run the
workflow on GitHub before teammates branch from it. The first feature should
agree on a requirement API contract and authorization model before schema work.
Suggested independent ownership: requirement API/persistence, requirement UI
against the agreed contract, GitHub integration investigation, and Playwright
acceptance scenarios. Ask the user about branching before starting any new task.
