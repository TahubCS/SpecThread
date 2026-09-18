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

ASP.NET Core Web API, C#

Domain rules, authorization, persistence coordination, integrations

Database

PostgreSQL

Requirements, links, evidence metadata, decisions, audit data

Repository integration

GitHub REST/GraphQL APIs and webhooks

Repository, issue, pull request, commit, and check data

Runtime verification

Playwright

A limited set of explicitly configured end-to-end checks

Local environment

Docker Compose

Reproducible PostgreSQL and optional supporting services

Continuous integration

GitHub Actions

Build, lint, test, and migration validation

API contract

OpenAPI

Documented boundary between the web application and API

Exact library choices should be made only when the first task requires them and recorded in DECISIONS.md.

Project testing

Playwright Test is the shared runner for all automated behavior tests (ADR-005). The root playwright.config.ts discovers tests under tests/. The initial Chromium smoke test lives in tests/e2e/ and runs against the existing root Next.js application using a fresh production build. HTTP API tests and directly testable TypeScript logic will use the same runner when those features exist. Playwright does not directly run C# unit tests; any future need for those requires an explicit tooling decision. Linting, type checking, and compilation remain separate checks. See TESTING.md for setup and commands.

This repository testing policy is separate from the product's limited, project-defined runtime verification scenarios. It does not expand SpecThread into an arbitrary test-execution service.

Suggested repository layout

/
├── apps/
│   ├── web/                  # Next.js application
│   └── api/                  # ASP.NET Core Web API
├── tests/
│   └── e2e/                  # Playwright project
├── docs/
│   ├── PROJECT.md
│   ├── ARCHITECTURE.md
│   ├── WORKFLOW.md
│   ├── HANDOFF.md
│   └── DECISIONS.md
├── infra/                    # Small, necessary local/deployment configuration
├── .github/workflows/
├── AGENTS.md
└── README.md

If the initialized Next.js application currently lives at the repository root, do not move it automatically. First determine whether the team wants a monorepo migration. A folder diagram is not permission to perform a disruptive move.

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

Deployment direction

Web: suitable for Vercel or another Next.js-capable host.

API: container-capable .NET hosting.

Database: managed PostgreSQL for shared environments.

The specific API and database hosts remain undecided. Local development should not depend on a paid service.
