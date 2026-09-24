SpecThread Architecture

Architectural approach

Use a modular monolith with clear boundaries. The Next.js web application and ASP.NET Core API are separate deployable applications in one repository. PostgreSQL stores authoritative product data. External systems are accessed through adapters.

This is intentionally not a microservice architecture. The capstone does not yet have scale or team requirements that justify distributed services.

Technology stack

Area

Choice

Responsibility

Web

Next.js App Router, React, TypeScript

User interface and browser-facing interactions

API

ASP.NET Core 10 Web API, C#, EF Core 10 with Npgsql

Domain rules, authorization, persistence coordination, integrations

Database

PostgreSQL hosted on Supabase

Requirements, links, evidence metadata, decisions, audit data

Repository integration

GitHub REST/GraphQL APIs and webhooks

Repository, issue, pull request, commit, and check data

Runtime verification

Playwright

A limited set of explicitly configured end-to-end checks

Local environment

Docker Compose only when a task requires local dependencies

No local database is required for the initial health and smoke checks

Continuous integration

GitHub Actions

Build, lint, test, and migration validation

API contract

OpenAPI

Documented boundary between the web application and API

Exact library choices should be made only when the first task requires them and recorded in DECISIONS.md.

Project testing

Playwright Test is the shared runner for automated behavior tests (ADR-005). The root playwright.config.ts discovers browser tests under tests/e2e/ and API tests under tests/api/. It runs the web application from app/web and the separate API from app/api. Linting, type checking, and compilation remain separate checks. See TESTING.md.

This repository testing policy is separate from the product's limited, project-defined runtime verification scenarios. It does not expand SpecThread into an arbitrary test-execution service.

Agreed repository layout (ADR-006)

/
├── app/
│   ├── web/                  # Next.js application
│   └── api/                  # ASP.NET Core Web API
├── tests/
│   ├── e2e/                  # Playwright browser tests
│   └── api/                  # Playwright API and EF setup tests
├── docs/
│   ├── PROJECT.md
│   ├── ARCHITECTURE.md
│   ├── WORKFLOW.md
│   ├── HANDOFF.md
│   └── DECISIONS.md
├── .github/workflows/
├── AGENTS.md
└── README.md

The user approved moving the existing web application to app/web and keeping the .NET API separate in app/api. The root is a small npm workspace with one lockfile and shared test/lint tooling; no monorepo build framework is needed.

Logical modules

The API should preserve these conceptual boundaries even if the initial implementation uses only a few projects or folders:

Requirements: requirement text, acceptance criteria, lifecycle, and ownership.

Evidence: normalized links to issues, pull requests, commits, checks, tests, and releases.

Integrations: GitHub authentication, API calls, webhook validation, synchronization, and rate-limit handling.

Verification: configured check definitions and recorded results.

Review: human acceptance or rejection decisions and notes.

Audit: important state changes and actors.

The web application should organize by product feature rather than by generic component type where practical. Shared UI primitives should remain small and presentation-focused.

Data model outline

The initial domain will likely include:

User

Project

RepositoryConnection

Requirement

AcceptanceCriterion

EvidenceLink

VerificationRun

ReviewDecision

AuditEvent

This is a conceptual model, not a finalized database schema. Do not generate all tables before the related use cases are designed.

Trust boundaries

Browser input must be validated by the API.

GitHub webhooks must have verified signatures and idempotent processing.

OAuth and installation tokens must be encrypted or held by the deployment platform's secret system; never expose them to the browser.

AI output, if introduced, is untrusted advisory content and must never directly approve requirements or execute privileged actions.

Playwright execution must use controlled targets and scenarios. Do not build arbitrary remote code or unrestricted URL execution into the MVP.

Integration behavior

Prefer explicit references first, such as a requirement identifier in a GitHub issue or pull-request description. Automated matching may later suggest candidates, but it must not silently create authoritative links.

Persist normalized evidence metadata needed by the UI, along with stable external identifiers and URLs. Avoid copying entire external payloads into the product database without a demonstrated need.

API direction

The ASP.NET API owns domain rules and database access. Next.js should call the documented API rather than duplicate domain logic in route handlers or server actions. Generate or maintain a typed client from OpenAPI only after the contract stabilizes enough to justify it.

Better Auth runs in Next.js with GitHub OAuth and authentication-only database access. Its JWT plugin signs ES256 tokens that the API validates against the web app's JWKS (ADR-015); project membership enforcement remains unimplemented. GitHub Apps repository integration is still pending. The dashboard remains a public, empty preview. Auth requires explicit secret, database URL, and canonical origin configuration; remote database connections verify TLS. Optional dashboard integration requires an environment key. See DEPLOYMENT.md.

The API exposes anonymous GET /health returning { "status": "ok" } and authenticated GET /me returning { "userId": "<sub>" }. Every other endpoint requires a valid Better Auth JWT by default (ADR-015). This is a liveness check, not database readiness. Development exposes /openapi/v1.json; production does not. EF Core maps five auth and four product tables in public, and owns InitialSchema and future migrations. Startup does not create, migrate, or query the database. Database use fails explicitly if ConnectionStrings:Database is missing. RLS and revoked browser-role grants deny Data API access by default; this does not replace server-side project authorization. Supabase-managed schemas must not be modified. See DATABASE.md.

Deployment direction (ADR-010)

Web: Vercel (Next.js App Router in app/web).

API: Render (ASP.NET Core 10 Web API via Docker container).

Database: PostgreSQL on Supabase.

See docs/DEPLOYMENT.md for step-by-step platform configuration, environment variables, health checks, and secrets management. Health and smoke checks run without a database account. Live persistence work requires separately configured Supabase database credentials; MCP authentication does not provide an application connection string.
