# CI Pipeline Feedback and Deployment Availability

## Status

Implemented on `feature/pipeline-feedback`; pending PR review and GitHub Actions validation.

## Problem

The current GitHub Actions workflow validates pull requests and deploys the API after
merges to `main`. It does not retain Playwright reports as workflow artifacts, NuGet
restore caching is not configured, and the deployment job stops after calling the
Render deploy hook without checking that the public API is responding.

## Goals

- Make failed Playwright runs easier to diagnose from GitHub Actions.
- Reuse NuGet packages across runs, keyed by the API lock file while retaining locked
  restores.
- After the API deploy hook is accepted, check that the Render API health endpoint
  returns the expected liveness response within a bounded time.

## Non-goals

- Change application behavior, database schema, or migration order.
- Deploy the web app; Vercel continues to manage that separately.
- Add Render API credentials, query Render's deployment API, or prove that the
  responding process is running the exact requested commit.
- Retry a failed migration, roll back a deployment automatically, or run deploy checks
  on pull requests.

## Design

1. Configure `actions/setup-dotnet` NuGet caching in the `verify` and `deploy-api`
   jobs, using `app/api/packages.lock.json` as the cache dependency. Keep
   `dotnet restore --locked-mode` unchanged.
2. If `verify` fails, upload `playwright-report/` and `test-results/` as a GitHub
   Actions artifact for seven days. Ignore missing artifact directories because a
   failure can occur before Playwright starts. The test workflow uses isolated,
   disposable data and dummy provider credentials.
3. After the Render deploy-hook request succeeds, poll
   `https://specthread-api.onrender.com/health` for up to five minutes. Succeed only
   when the response is HTTP 200 with `{"status":"ok"}`; otherwise fail the deploy
  job with a concise diagnostic. Each request is capped at two seconds, with an
  eight-second pause between at most 30 attempts, keeping the total below five
  minutes. Never print the deploy-hook URL or credentials.

The health endpoint is a liveness check. Without querying Render's deployment API or
exposing a build identifier, this verifies service availability but does not prove that
the exact requested commit is serving traffic.

## Acceptance criteria

- Pull-request checks and their ordering are unchanged; deployment still runs only on
  pushes to `main` after `verify` and `api-image` pass.
- Failed `verify` runs retain any available Playwright report and test results for
  seven days, without failing solely because a report directory is absent.
- NuGet cache keys follow `app/api/packages.lock.json`; locked restore remains enabled
  in both jobs.
- The deployment job performs bounded health polling after the hook succeeds and fails
  clearly on timeout or an unexpected response.
- No secrets, database data, migrations, new services, or third-party test frameworks
  are added.

## Validation

- Workflow YAML parsing and structural assertions passed; the health polling worst case
  is 292 seconds. `git diff --check` passed.
- Passed locally: `npm run lint`, `npm run typecheck`,
  `dotnet format app/api --verify-no-changes --no-restore`, `npm run build`,
  `npm run build:api`, and `npm test` (409 passed).
- GitHub Actions has not run on this branch yet. The live Render health check runs only
  after a merge to `main`; no production deployment was triggered during local validation.