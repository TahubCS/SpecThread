Shared Handoff

This file records the current integration state. Replace the template entries as work is merged. Do not paste entire chat transcripts or use this file as a permanent decision log.

Current project state

Phase: Foundation setup

Integration branch: To be chosen by the team

Latest stable milestone: Next.js project initialized; Playwright foundation verified locally on feature/playwright-foundation (not yet merged)

Current focus: Review the Playwright testing foundation, then continue the remaining shared foundation decisions

Confirmed decisions

Product: SpecThread

Core value: Trace requirements to inspectable implementation evidence

Web: Next.js App Router with TypeScript

API: ASP.NET Core Web API with C#

Database: PostgreSQL

Repository provider for MVP: GitHub

Runtime verification: limited, explicit Playwright scenarios

Development testing: Playwright Test is the shared runner for all automated behavior tests (ADR-005); lint, type checking, and builds remain separate checks

CI: GitHub Actions

Architecture: modular monolith, not microservices

Approval: human review remains authoritative

Decisions still required

Whether to keep the initialized Next.js project at the repository root or move it to apps/web

Package manager and supported runtime versions

.NET target version

Authentication approach

PostgreSQL data-access library and migration tooling

GitHub OAuth App versus GitHub App integration

Integration branch name and merge policy

Shared deployment providers

Do not let an implementation agent choose these silently when the choice affects the whole team.

Known risks

The product can become too broad if “verification” is treated as proof of arbitrary behavior.

GitHub authentication, permissions, webhook security, and rate limits may consume more time than expected.

Moving the existing Next.js app into a monorepo can create unnecessary setup work if done before the team agrees.

Parallel frontend and backend work will drift without a small shared API contract.

Immediate next step

Review the uncommitted changes on feature/playwright-foundation and run npm ci, npx playwright install chromium, and npm test from the repository root on a teammate's checkout. Commit and merge through the team's agreed workflow. Resolve the remaining foundation decisions before structural or backend work; no API or application move was introduced here.

Playwright foundation handoff

Date: 2026-09-18

Author: Codex

Branch: feature/playwright-foundation, created from the existing clean local main; no commits or pushes made by this task

Task: Initialize Playwright and document it as the project's shared behavior-test runner

Completed:

- Installed @playwright/test 1.63.0 as the only new direct development dependency and generated the npm lockfile update.
- Added root configuration with Chromium, automatic production build/server startup, CI safeguards, HTML reporting, and failure artifacts.
- Added one real smoke test for the existing starter homepage; no product scenarios were invented.
- Added test, test:ui, test:report, and typecheck scripts. Excluded generated test artifacts from Git and ESLint.
- Synchronized testing policy across agent instructions, README, architecture, workflow, ADR-005, and TESTING.md.

Changed files:

- Added: playwright.config.ts, tests/e2e/home.spec.ts, docs/TESTING.md.
- Updated: package.json, package-lock.json, .gitignore, eslint.config.mjs, AGENTS.md, README.md, docs/ARCHITECTURE.md, docs/WORKFLOW.md, docs/DECISIONS.md, docs/HANDOFF.md.

Decisions and assumptions:

- The user's testing instruction authorizes Playwright as the shared runner; HTTP API behavior will use its request fixtures when the API exists.
- Keep the current root web application in place for this task. This does not settle a future layout migration or integration policy.
- Start with Chromium only. The smoke test reflects the existing starter and must change with the homepage.
- Playwright cannot directly run C# unit tests; introducing another runner requires a recorded team decision.

Commands and results:

- npm install --save-dev --save-exact @playwright/test: passed; 3 packages added, npm reported 0 vulnerabilities.
- npx playwright install chromium: passed; Chromium and its headless shell installed.
- npm test -- --list: passed; 1 Chromium test discovered in 1 file.
- npm run lint: passed, including after the generated-artifact ignore update.
- npm run typecheck: passed; Next.js route types generated and TypeScript reported no errors.
- npm test: passed; 1 test passed, including a successful production build and managed server startup (16.3 seconds total).
- git diff --check: passed. Diff and new files reviewed; generated results are ignored and no product code or secrets were added.
- Initial sandbox attempts could not write the Git branch/npm cache or spawn Playwright processes. Approved elevated retries succeeded; no approval remains pending.

Known limitations and risks:

- Chromium smoke coverage only; no product flows, API tests, CI workflow, or standalone formatter exists yet. Interactive UI mode and report viewer were not manually exercised.
- A separate clean-checkout npm ci was not run in this task; dependency installation and all listed checks used the current checkout.
- The production build currently fetches Google Fonts. Tests require network access for that build and a free local port 3100. Avoid concurrent Next.js development/build processes sharing .next/.
- The existing docs/PROJECT.md reference still points to a file actually named docs/PROJECTS.md; this unrelated naming issue remains for the broader foundation task.

Exact next step: Review and integrate this testing change, then define the first product slice and its Playwright acceptance scenarios before implementing it.

Handoff entry template

Date and author

Date:

Author or agent:

Branch:

Task or issue:

Completed



Changed files



Decisions and assumptions



Verification performed

Command:

Result:

Known issues or risks



Exact next step

