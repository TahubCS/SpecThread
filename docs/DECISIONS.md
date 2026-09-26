Architecture Decision Log

Record durable choices here. Add a new entry; do not rewrite history merely because a later decision supersedes an earlier one.

ADR-001: Use Next.js for the web application

Status: Accepted

Context: The earlier proposal used SvelteKit, but the initialized project and team direction use Next.js.

Decision: Use Next.js App Router with TypeScript for the web application.

Consequences: The team needs one agreed Next.js structure and must avoid duplicating API domain logic inside Next.js when ASP.NET Core owns the backend.

ADR-002: Use ASP.NET Core as the product API

Status: Accepted

Context: The project is intended to expose the team to a stack beyond a single full-stack JavaScript application.

Decision: Use an ASP.NET Core Web API for domain rules, authorization, persistence coordination, and external integrations.

Consequences: The web and API need an explicit contract. Running two applications adds setup cost, so boundaries must remain simple.

ADR-003: Start as a modular monolith

Status: Accepted

Context: SpecThread has several conceptual domains but no demonstrated need for independently deployed services.

Decision: Keep one API deployment with internal modules and one web deployment.

Consequences: Development and transactions remain simpler. Modules can be extracted later only if evidence justifies it.

ADR-004: Treat automated results as evidence, not proof

Status: Accepted

Context: Arbitrary requirements cannot be conclusively verified by AI or one browser test.

Decision: SpecThread aggregates evidence and evaluates configured checks, while an authorized human makes the final acceptance decision.

Consequences: UI language, statuses, and data models must distinguish linked evidence, passing checks, evidence completeness, and human acceptance.

ADR-005: Standardize automated behavior testing on Playwright Test

Status: Accepted

Context: The team requested Playwright configuration first and a shared testing approach for the project.

Decision: Use @playwright/test as the runner for all automated behavior tests. Keep a single root playwright.config.ts with tests under tests/. Start with Chromium and a smoke test for the existing homepage. Playwright builds and starts its own production web server on 127.0.0.1:3100 and does not reuse another process. Retain traces and screenshots on failure, and generate an HTML report. Use request fixtures for future HTTP API tests and browser-free tests for directly testable TypeScript logic.

Consequences: The only new direct dependency is a development dependency, @playwright/test. Developers must install its Chromium binary. Test runs require a production build; the existing next/font/google setup also requires access to Google Fonts during that build. Linting, type checking, and builds remain separate quality checks. Playwright cannot directly execute C# unit tests; API behavior will be tested over HTTP, and adding another runner requires a later recorded team decision. This decision does not choose API contracts, move the web app, or broaden the product's runtime-verification scope.

ADR-006: Separate applications in app/web and app/api

Status: Accepted

Context: The user explicitly approved retaining ASP.NET Core, moving Next.js into app/web, and targeting .NET 10 while working on main.

Decision: Preserve the existing Next.js app in app/web; add a minimal ASP.NET Core 10 API in app/api. Use npm workspaces with one root package-lock.json and root Playwright tooling. Use Node.js 24/npm 11 and pin the .NET SDK to 10.0.401 with patch roll-forward. The health-only API requires no database. Development OpenAPI is the inspectable API contract.

Consequences: Each application has its own runtime and build, with root convenience commands. Supersedes the initial root-web layout described in ADR-005. The user controls branch creation under the existing permission policy.

ADR-007: Supabase PostgreSQL with EF Core as the sole ORM and migration owner

Status: Accepted

Context: The user selected Supabase PostgreSQL and subsequently approved replacing the proposed TypeScript-only Drizzle ORM with EF Core for the C# backend.

Decision: Use EF Core 10 with Npgsql for data access and schema migrations. Initialize and verify the context before database execution. Use one local dotnet-ef tool manifest. Keep credentials in API user-secrets or environment variables. Do not automatically create databases or apply migrations during startup. Do not introduce Drizzle or a competing migration system.

Consequences: No application schema is invented in the foundation. The future persistence task must define authorization, schema exposure/RLS, and migration rollback before creating tables. Supabase-owned auth/storage schemas remain outside EF ownership. The initial health endpoint does not imply database readiness. The project-scoped Supabase MCP connection is developer tooling, not application database authentication. Optional duplicate Supabase skills are unnecessary because the Supabase skill is already installed.

ADR-008: Stage the UI before authentication and persistence

Status: Accepted

Context: The user approved Better Auth with GitHub OAuth, GitHub Apps for repository access, and owner/member project access, then explicitly limited the immediate task to a minimal UI skeleton on main.

Decision: Add home, login, signup, and a public dashboard preview first. No simulated sessions, credential collection, product tables, or deployment in this stage. Later implement Better Auth in Next.js with authentication-only database access and C# token validation; keep product data access in the API. Enforce project membership, allow members to create/edit requirements, and restrict project ownership changes to authorized owners. Review/approval permissions still require agreement before review endpoints exist.

Consequences: The planned authentication-only database access is an explicit exception to the earlier API-only database boundary. EF remains the migration owner, with Better Auth schema compatibility to be verified before implementation. Tables await the user's next instruction, followed by auth and GitHub work. Vercel is the chosen web host; deployment and the final API hosting plan remain deferred. Public dashboard access is only for this empty preview and must be replaced with enforced access before exposing product data.

ADR-009: Initial Application and Authentication Schema with EF Core and RLS

Status: Accepted

Context: Persistence foundation requires establishing the initial database schema supporting both Better Auth (core + JWT plugin) and SpecThread core domain models (projects, project members, requirements, and acceptance criteria). Tables hosted on Supabase must not be exposed unintentionally through public PostgREST / Supabase Data APIs.

Decision: Use EF Core 10 to manage the initial schema migration (20260919042809_InitialSchema). Map Better Auth tables (user, session, account, verification, jwks) with camelCase column naming matching Better Auth 1.7.5 expectations. Map SpecThread domain tables (projects, project_members, requirements, acceptance_criteria) with snake_case naming, check constraints, foreign keys, and optimistic concurrency versioning on requirements. Embed Row Level Security (RLS) enablement and permission revocation (REVOKE ALL FROM PUBLIC, anon, authenticated) directly into the migration transaction so that tables are securely isolated by default. Generate and preserve idempotent forward (docs/schema/initial.sql) and backward (docs/schema/rollback.sql) scripts, and verify them against disposable test containers.

Consequences: The database schema is strictly locked down from browser and anon/authenticated Supabase roles by default. Better Auth in Next.js and EF Core in ASP.NET Core access PostgreSQL via authenticated connection pooling. Database rollback is defined and automated in Playwright tests.

ADR-010: Web Deployment on Vercel and API Container Deployment on Render

Status: Accepted

Context: The SpecThread product architecture requires hosting platforms for both deployable units: the Next.js web application (in app/web) and the ASP.NET Core 10 Web API (in app/api).

Decision: Deploy the Next.js web application to Vercel with Root Directory set to app/web and workspace build support. Deploy the ASP.NET Core 10 Web API to Render as a Docker web service using a multi-stage Dockerfile based on official Microsoft .NET 10 SDK and ASP.NET runtime images. Supply a render.yaml blueprint configuring service parameters, the /health endpoint for liveness checks, and unprivileged execution (USER $APP_UID) on port 8080. Secrets and database connection strings are passed exclusively through platform environment variables and never committed.

Consequences: Clear separation of operational concerns. The Next.js frontend benefits from Vercel's global edge network and serverless rendering, while the C# API runs in a reproducible Linux container on Render with zero cloud vendor lock-in.

ADR-011: Supabase Root CA Baking in Docker Container for Linux Trust Store Integration

Status: Accepted

Context: Connecting Npgsql with `SSL Mode=VerifyFull` to Supabase's connection pooler requires trusting the custom `Supabase Root 2021 CA`. In local Windows development, this previously required an absolute file path in `Root Certificate=...`. On Render, absolute container paths in environment variables are fragile and leak deployment details into connection strings.

Decision: Place the public Supabase Root 2021 CA certificate in `app/api/certs/prod-ca-2021.crt`. During the Docker runtime stage, copy this certificate to `/usr/local/share/ca-certificates/supabase-root-2021.crt` and execute `/usr/sbin/update-ca-certificates`. This registers the certificate directly into Debian's system certificate bundle (`/etc/ssl/certs/ca-certificates.crt`).

Consequences: In production on Render, the Npgsql connection string simply requires `SSL Mode=VerifyFull;` without specifying `Root Certificate=...` or any file path. Both Linux OpenSSL and .NET `X509Chain` natively validate the Supabase TLS certificate chain. Local development can either continue using the existing local certificate path or rely on developer root stores.

ADR-012: Require explicit auth configuration and verified database TLS

Status: Accepted

Context: The user approved fixing hardcoded auth fallbacks, disabled certificate
verification, and broad trusted-origin wildcards on main.

Decision: Require an explicit random secret, PostgreSQL URL, and canonical app
origin. Trust only that origin. Enable the dashboard plugin only with an explicit
environment key. Verify TLS for remote PostgreSQL; optionally supply the CA PEM
through DATABASE_CA_CERT. Keep loopback plaintext for local testing. Isolate
Playwright auth settings from developer credentials. EF remains the migration owner.

Consequences: Deployment settings must be updated before releasing these fixes.
Previously committed dashboard credentials need rotation outside the repository.
JWT validation, project authorization, and GitHub Apps are separate unfinished work.
Correction to ADR-009: the generated forward/rollback scripts are not idempotent;
RLS is enabled with no allow policies, rather than user-specific access policies.

ADR-013: Prefer Vercel client IP headers for Better Auth

Status: Accepted

Context: The user approved implementing only recommendation 1 (proxy IP headers)
on main. Better Auth runs in Next.js on Vercel.

Decision: Resolve client IPs from x-vercel-forwarded-for first, then
x-forwarded-for. Keep Better Auth's IP parsing and rate-limit defaults; do not
trust unrelated proxy headers or add speculative trusted proxy ranges.

Consequences: The deployment must use trusted Vercel ingress and must reassess
header trust if its proxy topology changes. In-memory limits remain per instance;
shared storage, OAuth error pages, database joins, and app naming are deferred.

New decision template

ADR-014: Complete auth error handling, joins, and shared rate limits

Status: Accepted

Context: After recommendation 1, the user approved all nine implementation and
verification steps on main, including shared storage and the remaining insights.

Decision: Name the auth application SpecThread, use the existing PostgreSQL
adapter's joins, and use database-backed rate limiting through an EF-owned
AuthRateLimits migration. Keep production-only default enforcement and existing
thresholds. Provide a public /auth/error page with fixed messages, use both
global and per-flow error destinations, handle returned initiation errors, and
use same-origin browser auth requests. Retain exact trusted origins and TLS.

Consequences: Apply the migration before deploying the web app; database outages
affect rate-limited requests. No new production dependency or service is added.
Tests now require Docker even for the managed web server to exercise production
database rate limiting with isolated credentials. Real OAuth and proxy behavior
still require deployment verification. Rollback order is documented in DATABASE.md.


ADR-016: Email/password and Google sign-in with account linking

Status: Accepted

Context: The team decided SpecThread accounts should not depend on GitHub alone.
Users need traditional sign-in and Google sign-in, and must be able to connect
GitHub to an existing account. (ADR-015 is used by the separate API JWT
validation change.)

Decision: Enable Better Auth 1.7.5 email/password sign-in with required email
verification before sign-in, a 12-character minimum password, verification links
that sign the user in, single-use reset links, and session revocation on reset.
Keep GitHub sign-in and add Google; each social provider is enabled only when both
its client ID and secret are set. Signed-in users link or unlink Google and GitHub
from /account. Unlinking must leave at least one usable method: email/password or
a provider enabled in this deployment. The account page and a server-side
account delete hook, scoped to /unlink-account, both enforce this; Better Auth
alone only refuses to remove the last linked account. Unlinking requires a
recent sign-in. Implicit linking by matching email keeps Better Auth's
default: the provider must verify the email and the local email must be verified;
no provider is trusted to bypass this. Explicit linking allows a provider email
that differs from the account email (allowDifferentEmails), because the user is
already signed in and completes the provider's OAuth. Duplicate sign-ups and reset
requests answer identically, so they do not reveal which emails have accounts.

Email is sent through Resend's HTTP API with fetch; no new package. RESEND_API_KEY
and EMAIL_FROM are required unless EMAIL_DELIVERY=log, which prints messages
(including one-time links) to the server console and is accepted only for a
loopback BETTER_AUTH_URL, for local development and tests.

Consequences: No database migration; the existing account, user, and verification
tables already hold credentials, verification state, and links. Deployments need
Resend and Google configuration before shipping (DEPLOYMENT.md). Email delivery
failures block sign-up verification and resets until fixed. The team GitHub App is
private, so non-owners cannot use it for sign-in or linking until it is made public
or replaced with an OAuth App. Two-factor authentication, email changes, and
account deletion remain out of scope.
ADR-015: Validate Better Auth ES256 JWTs in the API through JWKS

Status: Accepted

Context: The API must identify callers before any product endpoint or project
membership check can exist. Better Auth's JWT plugin defaults to EdDSA (Ed25519),
which ASP.NET Core's JwtBearer and IdentityModel cannot validate without an
additional cryptography dependency. Better Auth publishes a bare JWKS without an
OpenID discovery document.

Decision: Configure the Better Auth JWT plugin with ES256. The API uses
Microsoft.AspNetCore.Authentication.JwtBearer and fetches public keys over HTTP from
{Auth:Issuer}/api/auth/jwks through IdentityModel's cached ConfigurationManager.
Auth:Issuer (environment Auth__Issuer) is the web app's exact origin: HTTPS, or HTTP
on loopback. Tokens must be ES256, signed by a published key, unexpired (30-second
skew), and have iss and aud equal to that origin. The sub claim is the Better Auth
user id. All endpoints require an authenticated user with a subject unless marked
AllowAnonymous; /health and development OpenAPI are anonymous. Unknown routes
return 401 to anonymous callers and 404 to authenticated callers. GET /me returns
{ "userId": sub } as the smallest verifiable authenticated endpoint.

Consequences: One new direct API package, from the ASP.NET Core release train.
The API depends on the web app's JWKS endpoint for key refreshes, not the jwks
table format. A missing or invalid Auth:Issuer keeps the API and /health running
but fails requests that present a token with an explicit configuration error.
Existing EdDSA keys must be expired once after deploying the web change, or
Better Auth keeps signing with them (DEPLOYMENT.md). Project membership, role
rules, and callers sending tokens from the web app remain separate work.
ADR-015: Validate auth inputs early and encrypt newly stored OAuth tokens

Status: Accepted

Context: The user requested a skill-guided auth configuration improvement on
auth/optimize after the earlier configuration work was merged.

Decision: Parse configured CA PEM certificates before constructing the pool;
trim GitHub credentials and require a complete pair when enabled; use Better
Auth 1.7.5's built-in account.encryptOAuthTokens for OAuth writes. Keep the
existing EF schema, secret, exact origins, joins, and shared rate-limit storage.

Consequences: No new dependency, environment variable, or migration. Bad local
configuration now fails early without exposing values. Encryption does not
backfill historical plaintext tokens. Deployment must retain the encryption
secret and option; see DEPLOYMENT.md for compatibility and rollback limitations.

ADR-NNN: Title

Status: Proposed, Accepted, Superseded, or Rejected

Context:

Decision:

Consequences:
