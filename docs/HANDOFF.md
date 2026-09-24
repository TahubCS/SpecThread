# Shared handoff

## Current task: API JWT validation (2026-09-23)

- Branch: feature/api-jwt-validation (from main). Changes are uncommitted. Nothing was deployed and no Supabase changes were made.
  Unrelated pre-existing working-tree changes were left untouched: deleted app/web/.env.example and app/api/.env.example, and modified package.json and package-lock.json.
- Completed:
  - Better Auth now signs JWTs with ES256 (`app/web/src/lib/create-auth.ts`).
  - The API validates `Authorization: Bearer` tokens against `{Auth:Issuer}/api/auth/jwks` (`app/api/Auth/`).
  - Every endpoint requires authentication by default. `/health` and development OpenAPI stay anonymous.
  - New `GET /me` endpoint returns `{ "userId": sub }`.
- Changed files:
  - API: app/api/{Program.cs,SpecThread.Api.csproj,packages.lock.json}, app/api/Auth/{AuthenticationSetup.cs,JwksRetriever.cs}
  - Web: app/web/src/lib/create-auth.ts
  - Tests: scripts/start-test-jwks.mjs, playwright.config.ts, tests/api/{auth-jwt,auth-unconfigured,health}.spec.ts, tests/schema/auth-jwt-runtime.spec.ts, tests/support/api-process.ts
  - Config and docs: render.yaml, README.md, docs/{ARCHITECTURE,DECISIONS,DEPLOYMENT,TESTING,HANDOFF}.md
- Decisions: ADR-015.
  - ES256 instead of EdDSA, because .NET can't validate EdDSA without an extra library.
  - Public keys come from the JWKS endpoint over HTTP, not from the jwks table.
  - Endpoints are authenticated by default. Anonymous callers now get 401 on unknown routes instead of 404; this changed the existing health.spec test.
  - `/me` is a proposed contract, and the team may rename it.
- Verification:
  - `npm run lint`, `npm run typecheck`, and `npm run build:api` all passed (0 warnings).
  - `npm test`: 48 passed. Docker Desktop had to be started, and Playwright Chromium and dotnet tools had to be installed or restored locally first.
  - `git diff --check` passed.
- Known issues or risks:
  - Production needs the ordered rollout in DEPLOYMENT.md: deploy the web change, expire the EdDSA keys, then set `Auth__Issuer` on Render.
  - The API's key refresh depends on the web app's availability.
  - No web code sends tokens to the API yet.
  - Project membership checks are not implemented.
- Exact next step: review the changes and approve a commit, then open a PR to main. After that, implement project membership authorization.

## Previous task: Branch protection rules and PR enforcement workflow (2026-09-20)

- Branch: main (explicitly authorized one-time exception for establishing repository governance).
- Completed:
  - Updated `AGENTS.md` and `docs/WORKFLOW.md` establishing mandatory agent branching instructions:
    - Never edit or commit directly on `main`.
    - Detect `main` and immediately warn the user and prompt for a task branch name before making any changes.
    - On task branches, distinguish prompt iterations on the current task (stay on branch) from starting a different task (ask whether to stay or create a new branch).
    - Mandatory Pull Requests for merging all code into `main`.
  - Added `.github/workflows/enforce-pr.yml` CI workflow that validates any push to `main` originated from an associated, merged Pull Request (with `[skip-pr-check]` bypass flag for authorized emergency/setup commits).
- Changed files: `AGENTS.md`, `docs/WORKFLOW.md`, `.github/workflows/enforce-pr.yml`, `docs/HANDOFF.md`.
- Verification: `npm run lint` and `npm run typecheck` passed cleanly; `git diff --check` passed.
- Exact next step: User commits and pushes this configuration to `main`, and configures GitHub branch protection rules in repository settings to require Pull Requests.

## Previous task: Better Auth error handling, joins, and shared rate limits (2026-09-20)

- Branch: main, explicitly selected. Changes remain uncommitted; no live deployment or Supabase migration performed.
- Completed:
  - Added public `/auth/error` page (`app/web/src/app/auth/error/page.tsx`) rendering safe, sanitized error descriptions distinguishing user cancellation (`access_denied`), expired OAuth state (`state_not_found`/`state_mismatch`), and generic provider errors, with links to retry sign-in or return home.
  - Added `onAPIError: { errorURL: "/auth/error" }` in Better Auth configuration and `errorCallbackURL: "/auth/error"` when initiating social sign-in.
  - Updated `AuthPlaceholder` (`app/web/src/components/auth-placeholder.tsx`) to handle returned Better Auth errors (including HTTP 429 throttling and network errors) and preserve loading state during redirection.
  - Set `appName: "SpecThread"` in Better Auth server configuration.
  - Enabled Kysely PostgreSQL adapter `joins: true` and added session join integrity, expired/revoked session checks, and timing benchmark attachments to schema test reports.
  - Added shared rate-limiting storage via EF Core: added `AuthRateLimit` model to `app/api/Data/AuthModels.cs` and `SpecThreadDbContext.cs`, scaffolded migration `20260921021458_AuthRateLimits` with Row-Level Security (RLS) enabled and anon/authenticated permissions revoked, and generated idempotent forward/rollback SQL scripts (`docs/schema/auth-rate-limits.sql` and `auth-rate-limits-rollback.sql`).
  - Added test database automation (`scripts/test-database.mjs`, `scripts/start-test-web.mjs`, and `scripts/stop-test-web-database.mjs`) supporting ephemeral Docker PostgreSQL testing for web and schema suites, resilient against UTF-8 BOMs in SQL migration files.
  - Resolved CodeRabbit review feedback: added `scripts/build-api.mjs` via `globalSetup` in `playwright.config.ts` to build the API before server startup (preventing race conditions with concurrent webServer launchers), invoked compiled API DLL directly to prevent wrapper process leaks on Windows, and moved cache file operations inside the `try` block in `scripts/start-test-web.mjs` to protect database container cleanup.
  - Added comprehensive Playwright tests in `tests/e2e/auth.spec.ts` (covering error page, retryable initiation, network failure, 429 throttling, accessibility, and narrow screen layout) and `tests/schema/auth-runtime.spec.ts` (covering rate-limit schema match, RLS enforcement, multi-instance rate limiting, OAuth cancellation, session joins, and rollback/reapply).
- Changed files:
  - `app/api/Data/AuthModels.cs`, `app/api/Data/SpecThreadDbContext.cs`, `app/api/Migrations/SpecThreadDbContextModelSnapshot.cs`
  - `app/api/Migrations/20260921021458_AuthRateLimits.cs`, `app/api/Migrations/20260921021458_AuthRateLimits.Designer.cs`
  - `app/web/src/lib/create-auth.ts`, `app/web/src/lib/auth.ts`, `app/web/src/lib/auth-client.ts`, `app/web/src/components/auth-placeholder.tsx`, `app/web/src/app/auth/error/page.tsx`
  - `docs/schema/auth-rate-limits.sql`, `docs/schema/auth-rate-limits-rollback.sql`
  - `scripts/generate-auth-rate-limits.mjs`, `scripts/start-test-web.mjs`, `scripts/stop-test-web-database.mjs`, `scripts/test-database.d.mts`, `scripts/test-database.mjs`
  - `playwright.config.ts`, `tests/e2e/auth.spec.ts`, `tests/schema/auth-runtime.spec.ts`, `tests/schema/migration.spec.ts`
  - `docs/DATABASE.md`, `docs/DECISIONS.md` (ADR-014), `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/HANDOFF.md`
- Decisions: ADR-014. Name auth app SpecThread, enable joins, use PostgreSQL shared rate-limiting storage via EF Core migration. Retain production-only rate limiting defaults. Error page is public and database-independent. Browser auth requests use the current origin.
- Verification:
  - `npm run lint`: passed cleanly.
  - `npm run typecheck`: passed cleanly across Next.js and root workspaces.
  - `dotnet build app/api --configuration Release`: passed with 0 warnings, 0 errors.
  - `npx playwright test --project=api`: 11 passed in 36.0s.
  - `npx playwright test --project=chromium`: 12 passed in 26.0s.
  - `npx playwright test --project=schema`: 11 passed in 34.1s.
  - `npm test`: all 34 tests across 7 files passed in 37.2s.
  - `git diff --check`: passed.
- Known issues or risks:
  - Live Supabase database must have the `AuthRateLimits` migration applied (`dotnet ef database update AuthRateLimits --project app/api` or via `docs/schema/auth-rate-limits.sql`) before deploying the updated web application; database outages will affect auth requests subject to rate limiting.
  - GitHub-side misconfigurations (e.g., unregistered redirect URI) display error messages directly on GitHub and cannot return to the local `/auth/error` page.
  - Real GitHub login and cancellation on live Vercel deployment must be verified following the rollout steps in `docs/DEPLOYMENT.md`.
- Exact next step:
  - Obtain user approval to commit these uncommitted changes to `main`.
  - Apply `AuthRateLimits` migration to Supabase.
  - Deploy updated web app to Vercel and verify live GitHub sign-in, cancellation, and error handling.

## Previous task: Vercel client IP headers (2026-09-20)

- Branch: main, explicitly selected. Recommendation 1 only; no commit or deployment.
- Completed: Better Auth now prefers x-vercel-forwarded-for, with x-forwarded-for
  as fallback. Added HTTP-handler tests for header precedence, distinct client
  buckets, 429 responses, fallback from absent/invalid Vercel headers, and ignoring
  unrelated Cloudflare headers. Tests use isolated in-memory limits, no live data.
- Changed files: app/web/src/lib/{auth.ts,auth-config.ts},
  tests/api/auth-config.spec.ts, docs/{DEPLOYMENT,DECISIONS,HANDOFF}.md.
- Decision: ADR-013. Trust assumes Vercel-managed ingress. Existing rate-limit
  defaults and in-memory storage are unchanged; distributed storage is deferred.
- Verification: npm run lint and npm run typecheck passed;
  npm test -- --project=api --project=chromium passed all 17 tests, including
  managed production web and Release API builds. git diff --check passed.
  The sandbox initially blocked process spawning (EPERM); the approved retry ran.
  First test run had one assertion failure: this Better Auth version uses
  X-Retry-After, not Retry-After. Corrected the assertion and reran successfully.
- Unverified: deployed proxy header handling and distributed rate limiting.
  Docker schema tests were not run; this task changes no database schema.
- Prior login follow-up: corrected the ignored local CA environment formatting;
  the user subsequently confirmed GitHub login both locally and on Vercel.
- Exact next step: review these uncommitted changes and verify header behavior in
  a controlled Vercel deployment. Wait for the user's confirmation before starting
  recommendation 2. OAuth error pages, joins, and app naming remain unchanged.

## Previous task: auth configuration fixes (2026-09-19)

- Branch: main, explicitly selected. Changes remain uncommitted; no deployment,
  production environment edits, key rotation, or database migration performed.
- Completed: removed hardcoded dashboard key and default secret fallback;
  required explicit secret/base URL/database settings; restricted trusted origins
  to the canonical app origin; enforced certificate verification for remote pg
  connections with optional DATABASE_CA_CERT PEM; made dashboard plugin opt-in.
- Playwright web server uses isolated credentials and an unreachable loopback
  database, with GitHub and dashboard integrations disabled. Added config failure,
  TLS-override, and HTTP origin rejection/acceptance tests.
- Changed files: app/web/src/lib/{auth.ts,auth-config.ts}, app/web/.env.example,
  playwright.config.ts, tests/api/auth-config.spec.ts, tests/e2e/home.spec.ts,
  README.md, docs/{ARCHITECTURE,DATABASE,DECISIONS,DEPLOYMENT,TESTING,HANDOFF}.md.
- Decisions: ADR-012; no new dependencies or changes to EF ownership. Public RLS
  tables remain unchanged. Corrected stale docs and the claim that migration SQL
  is idempotent. Historical handoff below describes earlier work, not current scope.
- Checks: npm run lint and npm run typecheck passed. Latest npm test built the
  production web and Release API successfully; all 15 non-schema tests passed.
  Schema setup failed because Docker's dockerDesktopLinuxEngine pipe was absent,
  leaving five further schema tests skipped. Launching Docker Desktop hidden and
  checking docker info did not restore the engine. No schema code was changed.
  Initial origin test was corrected to use a cookie-bearing sign-out request.
  git diff --check passed. C# sources were unchanged.
- Unverified: full schema suite in this session, real GitHub OAuth, and deployed
  TLS connectivity. Existing handoff deployment/migration reports were not
  independently revalidated. No production credentials were printed.
- Exact next steps: restore Docker engine and rerun npm test; rotate the previously
  committed Better Auth dashboard key; configure Vercel's required secret, exact
  URL, database URL, and CA PEM before deployment. If the old default auth secret
  was used, replace it too (existing sessions may need sign-in). Follow
  DEPLOYMENT.md. Obtain explicit approval before committing. C# JWT validation
  and project authorization remain separate unfinished tasks.

## Previous task: deployment configuration for Vercel and Render (2026-09-19)

- Branch: main, continuing on approved integration branch.
- Live Deployments:
  - Web (Vercel): https://web-alpha-lovat-61.vercel.app/
  - API (Render): https://specthread-api.onrender.com/
- Completed work:
  - Added .dockerignore ignoring host build artifacts (bin/, obj/), .git, .next, node_modules, and local env files for fast, clean container builds.
  - Created root multi-stage Dockerfile targeting official Microsoft .NET 10 SDK and ASP.NET runtime images, restoring in locked mode and running unprivileged as $APP_UID on port 8080.
  - Solved Supabase Root CA validation for production containers: added app/api/certs/prod-ca-2021.crt and configured the Dockerfile runtime stage to install it via update-ca-certificates into the Debian trust store (/etc/ssl/certs/ca-certificates.crt).
  - Verified Docker container build and certificate trust via openssl verify; Npgsql connects with SSL Mode=VerifyFull without requiring local file path parameters in Render environment variables.
  - Created render.yaml defining the Render Blueprint web service specification for specthread-api.
  - Added app/web/vercel.json and installed typescript in app/web devDependencies for clean isolated Vercel builds.
  - Added https://*.vercel.app to Better Auth trustedOrigins in app/web/src/lib/auth.ts for seamless cross-origin and preview authentication.
  - Authored comprehensive docs/DEPLOYMENT.md guide covering Vercel and Render step-by-step setup, environment variables, GitHub OAuth callback URLs, TLS certificate configuration, and verification.
  - Recorded ADR-010 and ADR-011 in docs/DECISIONS.md and updated docs/ARCHITECTURE.md.
- Changed files:
  - .dockerignore, Dockerfile, render.yaml, app/web/vercel.json, app/web/package.json, package-lock.json
  - app/web/src/lib/auth.ts, app/api/certs/prod-ca-2021.crt, docs/DEPLOYMENT.md, docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/HANDOFF.md
- Validation:
  - Live Render API: GET https://specthread-api.onrender.com/health returned 200 OK ({"status":"ok"}).
  - Live Vercel Web: GET https://web-alpha-lovat-61.vercel.app/ returned 200 OK with SpecThread landing page.
  - Live Better Auth: GET https://web-alpha-lovat-61.vercel.app/api/auth/get-session returned 200 OK (null for unauthenticated).
  - docker build: passed in 7.1s, 701B context transfer.
  - docker container cert verification: openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt /usr/local/share/ca-certificates/supabase-root-2021.crt returned OK.
  - npm run lint: passed cleanly.
  - npm run typecheck: passed cleanly.
  - npm run build: Next.js production build succeeded in 1.1s.
  - dotnet build app/api --configuration Release: passed with 0 warnings, 0 errors.
  - npx playwright test: 17 passed in 31.2s.
  - git diff --check: passed.
- Known issues or risks:
  - GitHub OAuth Application must have Homepage URL and Authorization callback URL configured to the live Vercel domain.
- Exact next step:
  - Update GitHub OAuth App Authorization callback URL to https://web-alpha-lovat-61.vercel.app/api/auth/callback/github, set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on Vercel, and test live GitHub authentication.

## Previous task: initial schema migration and Better Auth setup (2026-09-19)

- Branch: main, continuing the approved sequence.
- Completed work:
  - Finalized C# EF Core models in app/api/Data/{AuthModels.cs, ProductModels.cs, SpecThreadDbContext.cs}.
  - Generated and finalized EF Core migration 20260919042809_InitialSchema with embedded PostgreSQL Row-Level Security (RLS) and public/anon/authenticated role privilege revocation.
  - Generated idempotent DDL artifacts docs/schema/initial.sql and docs/schema/rollback.sql.
  - Executed dotnet ef database update applying the migration to the live Supabase PostgreSQL database via the session pooler; all 9 tables, indices, check constraints, foreign keys, and RLS policies are live.
  - Verified EF model snapshot matching and tested schema integrity, Better Auth compatibility, constraints, and rollback in an ephemeral Docker container.
  - Implemented Better Auth in app/web: installed better-auth: 1.7.5 and pg: 8.23.0 with @types/pg: 8.23.1, added app/web/src/lib/auth.ts (PostgreSQL adapter, JWT plugin, GitHub social provider, validateSchema: false), app/web/src/lib/auth-client.ts (jwtClient), and app/web/src/app/api/auth/[...all]/route.ts (toNextJsHandler).
  - Documented environment variables in app/web/.env.example.
  - Updated app/web/src/components/auth-placeholder.tsx to provide an interactive GitHub sign-in button with loading and error states.
  - Updated tests/e2e/home.spec.ts with checks for interactive GitHub buttons and Better Auth /api/auth/get-session endpoint response.
  - Recorded ADR-009 in docs/DECISIONS.md.
- Changed files:
  - app/api/Data/SpecThreadDbContext.cs, app/api/Data/AuthModels.cs, app/api/Data/ProductModels.cs
  - app/api/Migrations/20260919042809_InitialSchema.cs, .Designer.cs, SpecThreadDbContextModelSnapshot.cs
  - docs/schema/initial.sql, rollback.sql, better-auth-1.7.5.json
  - scripts/generate-initial-schema.mjs, package.json, app/web/package.json
  - app/web/src/lib/auth.ts, auth-client.ts, app/web/src/app/api/auth/[...all]/route.ts, app/web/src/components/auth-placeholder.tsx, app/web/.env.example
  - playwright.config.ts, tests/schema/migration.spec.ts, tests/api/ef.spec.ts, tests/e2e/home.spec.ts
  - docs/DECISIONS.md, docs/HANDOFF.md
- Validation:
  - npm run lint: passed cleanly with zero errors.
  - npm run typecheck: passed cleanly across Next.js and root workspaces.
  - npm run build: production Next.js build succeeded in 2.4s.
  - dotnet build app/api --configuration Release: passed with 0 warnings, 0 errors.
  - dotnet ef database update --project app/api: succeeded on Supabase; applied 20260919042809_InitialSchema.
  - dotnet ef migrations list --project app/api: verified no pending migrations on Supabase.
  - npx playwright test: 17 passed across Chromium, API, and Schema suites in 29.3s.
- Known issues or risks:
  - Live GitHub sign-in requires GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET configured in the runtime environment.
  - Next.js web application requires DATABASE_URL and BETTER_AUTH_SECRET configured for live session persistence.
- Exact next step:
  - Create the GitHub OAuth application (or GitHub App), configure the credentials in app/web/.env.local, and test live sign-in flow and JWT verification against the ASP.NET Core API.

## Previous task: minimal web skeleton (2026-09-19)

- Branch: main, explicitly authorized. Existing connection-check handoff edits preserved.
- Added a homepage, login, signup, and empty public dashboard preview with shared
  navigation, responsive styling, page titles, and a keyboard skip link.
- GitHub sign-in and create/connect actions are visibly unavailable and disabled.
  No credential collection, fake sessions, API changes, data writes, or dependencies.
- Updated files: app/web/src/app/{page.tsx,layout.tsx,globals.css}; added
  login/page.tsx, signup/page.tsx, dashboard/page.tsx, and
  app/web/src/components/auth-placeholder.tsx. Updated tests/e2e/home.spec.ts,
  README.md, TESTING.md, ARCHITECTURE.md, DECISIONS.md, and this handoff.
- Recorded the user's approved Better Auth/GitHub OAuth, GitHub Apps, and project
  membership direction in ADR-008. Implementation is explicitly deferred.
- Validation: npm run lint and npm run typecheck passed. npm test passed all nine
  tests in 19.7 seconds, including web production and API builds. Initial build
  failed on a CSS UTF-8 BOM; removing the BOM resolved it. git diff --check passed.
  Reviewed desktop home and mobile login/dashboard screenshots under test-results/;
  no overflow or obscured controls. React review: server components, semantic links
  and headings, visible focus, no unnecessary hooks or client state.
- Unverified: real authentication, authorization, persistence, and GitHub actions
  remain intentionally unimplemented; no deployment was attempted.
- Limits: dashboard is public only because it has no real data; authentication and
  project authorization must be enforced before real product data is exposed.
- Exact next step: wait for the user's instruction to create tables, then implement
  Better Auth and GitHub integrations in the requested order. Deployment is deferred.
  No commits or pushes made for this UI task.

## Foundation history

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

Migrations, production API hosting, the
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

## Live connection check follow-up

- Branch: main, continuing the approved database setup. Application code unchanged.
- A temporary external C# probe initialized the existing EF context and attempted
  a read-only connection using app/api/.env.local, loaded explicitly for the probe.
  No credentials were printed. The normal API does not automatically load this file.
- The probe failed before authentication with SocketError NoData. DNS inspection
  found no IPv4 A record and one IPv6 AAAA record for the configured direct host.
  A TCP check to that IPv6 address on port 5432 returned NetworkUnreachable.
- No SELECT statement reached the database; no data or schema changes occurred.
- The user subsequently changed app/api/.env.local to the Session pooler. A retry
  reached that endpoint but failed TLS verification before authentication. A
  certificate diagnostic reported RemoteCertificateChainErrors / UntrustedRoot.
  The diagnostic rejected the untrusted certificate; verification was not bypassed.
- An earlier retry: Root Certificate was configured, but File.Exists returned false
  and Npgsql failed with DirectoryNotFoundException. No authentication or SQL
  execution occurred. Correct the certificate path to an existing local file.
- Previous retry: the certificate file exists, EF initialized, and the connection
  passed TLS verification with VerifyFull. PostgreSQL rejected authentication
  with SQLSTATE 28P01 (invalid_password). SELECT 1 did not execute.
- Latest retry succeeded: EF Core authenticated to Supabase through the session
  pooler with SSL Mode=VerifyFull and the configured CA certificate. SELECT 1
  returned 1. No data or schema changes were made and no credentials were printed.
- Next step: configure the same connection string in API user-secrets or its
  environment. The normal API does not load .env.local; only the temporary probe
  loaded it explicitly. Live credentials and connectivity are verified for the
  probe, not yet configured for normal API startup.
- Verification: DNS A/AAAA checks and IPv6 TCP diagnostic completed; git diff
  --check passed. Only this handoff was updated in the repository.
