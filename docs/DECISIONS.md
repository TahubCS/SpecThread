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

New decision template

ADR-NNN: Title

Status: Proposed, Accepted, Superseded, or Rejected

Context:

Decision:

Consequences:
