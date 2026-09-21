SpecThread Agent Working Agreement

This repository contains SpecThread, a team capstone project that connects software requirements to implementation evidence. Read this file and the relevant files in docs/ before changing code.

Product boundary

SpecThread helps a team trace a requirement through issues, pull requests, commits, automated checks, and releases. It does not claim that AI can prove arbitrary software is correct. AI may suggest relationships or summaries, but users must be able to inspect the underlying evidence and make the final acceptance decision.

Sources of truth

Read these in order:

docs/PROJECT.md — product purpose, users, scope, and MVP.

docs/ARCHITECTURE.md — system boundaries and technology choices.

docs/WORKFLOW.md — branch, task, review, and verification rules.

docs/HANDOFF.md — current shared project state and handoff format.

docs/DECISIONS.md — accepted architectural decisions.

If code and documentation disagree, do not silently choose one. Identify the conflict and update the appropriate source as part of the same change, or ask the team when the intended behavior is unclear.

Engineering priorities

In order:

Correctness and safety

Simplicity

Maintainability

Robustness

Scalability based on demonstrated needs

Delivery speed

Do not add abstractions, services, dependencies, or infrastructure for hypothetical future needs.

Before changing code

Read the task, relevant documentation, and affected code.

Inspect the current working tree and preserve unrelated work.

State the task boundary and acceptance criteria.

Search for existing implementations before adding new ones.

Identify affected interfaces, data models, tests, and documentation.

Ask a focused question if a missing decision would materially change the implementation.

Implementation rules

Work only within the assigned task and agreed acceptance criteria.

Prefer the smallest complete change.

Keep product logic out of UI components and external-service adapters.

Keep GitHub, AI-provider, database, and test-runner integrations behind explicit interfaces.

Validate all data at trust boundaries. Never trust webhook payloads, AI output, browser input, or third-party API responses without validation.

Never commit secrets, tokens, .env files, generated credentials, or personal data.

Do not invent API contracts, environment variables, database fields, or product behavior. Record real decisions in docs/DECISIONS.md.

Do not perform unrelated refactors in a feature branch.

Do not replace an agreed technology without an explicit team decision.

Generated files must be produced by a documented command and should not be edited manually.

Architecture constraints

Web client: Next.js App Router with TypeScript in app/web.

API: ASP.NET Core 10 Web API in C# in app/api.

Database: PostgreSQL hosted on Supabase. Use EF Core 10 with Npgsql for API data access and migrations; Drizzle is not used. Initialize and verify the EF Core context before any database execution. Never apply migrations or create a database automatically on API startup. See docs/DATABASE.md.

Repository integration: GitHub APIs and webhooks.

Runtime checks: Playwright, limited to explicit project-defined verification scenarios.

Local services: Docker Compose where it improves reproducibility.

CI: GitHub Actions.

AI is optional assistance, not the source of truth. The system must retain inspectable evidence and support deterministic operation for core workflows.

Use the existing repository layout. Do not create a second application, duplicate configuration, or move major directories unless the task explicitly requires it.

Quality requirements

TypeScript and C# must use strict compiler settings.

Add or update tests for changed behavior.

Use Playwright Test as the shared runner for all automated behavior tests. Cover browser flows with browser fixtures, HTTP boundaries with request fixtures, and directly testable TypeScript logic without a browser fixture. Keep tests focused on explicit scenarios. Do not introduce another test framework without a recorded team decision. Playwright does not directly execute C# unit tests; test API behavior through HTTP when the API exists. Linting, type checking, and builds remain separate required checks. See docs/TESTING.md.

Handle loading, empty, error, unauthorized, and retry states where relevant.

UI work must remain keyboard accessible, responsive, and readable.

Logs must be useful without exposing tokens, credentials, or sensitive payloads.

Database changes require migrations and a documented rollback consideration.

Verification

Run the narrowest relevant checks during development and the full required checks before handoff. At minimum, verify affected linting, type checking, tests, and builds. Never report a check as passing unless it was actually run. If a check cannot run, state exactly why and what remains unverified.

Git and team coordination

Never commit changes without explicit user approval. Always ask for permission before running git commit, and wait for the user's explicit consent. Keep working tree changes uncommitted until the user explicitly directs or approves committing them.

Branching and `main` protection rules (MANDATORY FOR ALL AGENTS):
- **Never work directly on `main`**: All new changes, fixes, and features must be developed on a dedicated task branch. Never make code or document edits directly on `main`.
- **Detecting `main`**: If the agent detects that the current branch is `main`, the agent MUST immediately remind the user that no changes are permitted on `main`, ask the user for a task branch name (or recommend one), and create and switch to that branch before making any changes.
- **Task boundary vs. prompt follow-up**:
  - While on a task branch, if the user sends follow-up prompts for the *same* task (e.g. debugging, testing, iterating on feedback), continue working on the current branch without re-asking.
  - When a task is complete (tested, verified, and fixed) and the user begins a *different* task (a new feature, bug fix, or separate requirement), the agent MUST ask the user if they wish to stay on the current branch or create and switch to a new branch for the new task.
- **Pull Requests required for merging into `main`**: All code changes must be merged into `main` exclusively through GitHub Pull Requests. Agents must remind users that a PR is required for merging code into `main` and must never run direct merge commands to `main`.

Recommended branch names: feature/<issue>-<short-name>, fix/<issue>-<short-name>, or docs/<issue>-<short-name>.

Keep commits focused and use meaningful messages.

Do not rewrite, delete, or overwrite another member's work.

Rebase or merge the latest integration branch before requesting review, according to the team's chosen policy.

Pull requests must explain the problem, solution, validation performed, screenshots for UI changes, migrations or environment changes, and known limitations.

Documentation and handoff

Every completed task must leave enough context for another teammate or AI agent to continue without guessing. Update docs/HANDOFF.md when shared project state changes. Record lasting choices in docs/DECISIONS.md; do not use the handoff file as permanent architecture documentation.

The handoff must include:

task and branch;

completed work;

changed files;

decisions and assumptions;

commands and checks run with results;

known issues or risks;

exact next step.

Completion standard

A task is complete only when its acceptance criteria are satisfied, relevant checks pass, documentation is synchronized, and the handoff is accurate. Stop and report blockers instead of hiding failures or expanding the scope without approval.
