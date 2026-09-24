# Testing SpecThread

Playwright Test is the shared behavior-test runner. Linting, TypeScript checks,
C# formatting, and builds remain separate checks.

## Setup and commands

From the repository root with Node.js 24, npm 11, and the SDK in global.json:

```sh
npm ci
dotnet restore app/api --locked-mode
dotnet tool restore
npx playwright install chromium
npm run lint
npm run typecheck
dotnet format app/api --verify-no-changes --no-restore
npm test
```

On Linux CI install browsers with `npx playwright install --with-deps chromium`.
The GitHub Actions workflow runs these same checks. It does not need Supabase
credentials. Reinstall Chromium after updating Playwright.

The test web server and schema project require a running Docker engine and
postgres:17. The first webServer entry calls scripts/build-api.mjs before starting
the second entry (the API). Do not move that build into globalSetup: Playwright
runs globalSetup after webServer startup, which locks the API DLL on Windows.
scripts/start-test-web.mjs verifies EF initialization, creates an isolated
password-protected database on a random loopback port, applies both versioned SQL
migrations, and builds/starts Next.js with that database. No persistent volume is
used. Global teardown also stops the web-test container on Windows, where
process-tree termination may skip signal handlers.
Auth tests use a random test secret, loopback base URL, and disabled live
GitHub/dashboard credentials. They never use Supabase or real OAuth accounts.
Schema runtime tests use a separate disposable database and simulated provider
cancellation; successful real GitHub login remains a deployment check.

```sh
npm test -- --list         # Discover tests without starting apps
npm test -- --project=api  # API/EF tests (both managed servers still start)
npm test -- --headed      # Visible browser
npm run test:ui            # Interactive test UI
npm run test:report        # Latest HTML report
npm run build             # Standalone web production build
npm run build:api          # Standalone Release API build
```

`npm test` builds the web app and the Release API before tests. It starts the
web app at 127.0.0.1:3100, a test-only JWKS issuer (scripts/start-test-jwks.mjs)
at 127.0.0.1:5101, and the API in Development at 127.0.0.1:5100 trusting that
issuer. Auth tests also start extra API instances on 5102-5104. Keep these
ports free; existing servers are not reused. Do not run competing Next.js builds
or development processes in this checkout: they share app/web/.next. Google Fonts
currently require network access during the web build.

## Current coverage

- Chromium: home/dashboard navigation, keyboard skip link, login/signup navigation,
  GitHub buttons, disabled product actions, and all four routes at mobile width.
  Desktop/mobile screenshots are saved inside the ignored test-results directory.
- API: health response without database credentials, development OpenAPI, and
  unknown routes (401 anonymous, 404 authenticated).
- API JWT validation: valid tokens identify the user; missing, malformed,
  expired, wrong-issuer, wrong-audience, no-expiry, unpublished-key, HS256, and
  alg-none tokens are rejected; missing subjects are forbidden; a missing
  Auth:Issuer fails explicitly. The test issuer generates keys per run.
  The schema suite validates a real Better Auth ES256 token against the API after
  expiring a legacy EdDSA key.
- EF: PostgreSQL provider initialization using dummy credentials at an unreachable
  local address, and explicit rejection when connection configuration is missing.
  These invoke the local dotnet-ef tool and never connect to Supabase.

- Auth: explicit configuration failures, verified TLS options, restricted origins,
  CA PEM parsing/bundles, complete GitHub credential pairs,
  session endpoint, HTTP rejection of unrelated origins, proxy header precedence,
  retryable HTTP/network failures, provider redirection, and a safe public error page.
- Schema: migration/rollback in Docker, Better Auth column compatibility, RLS,
  foreign keys, uniqueness, content constraints, and versioned SQL updates.
  Auth runtime tests additionally verify the rate-limit schema/RLS, simultaneous
  requests across independent auth instances, persistence across a fresh instance,
  window expiry, real OAuth-state cancellation, session joins, expired/revoked
  sessions, and isolated rate-limit rollback/reapply. Local join timing samples
  are attached to the Playwright report, without asserting a speedup ratio.
  A simulated successful GitHub callback verifies encrypted access/refresh tokens
  in PostgreSQL, usable token retrieval, prefixed legacy plaintext compatibility,
  and rejection of corrupt ciphertext. No real provider credentials are used.

Live OAuth, deployed TLS connectivity, and product flows are not tested. The health
endpoint is liveness, not database readiness. EF initialization is not proof
that live database credentials work.

## Conventions

Use browser fixtures in tests/e2e and request fixtures in tests/api. Use accessible
locators and retrying assertions, not arbitrary sleeps. Browser-free TypeScript
logic tests can get a separate Playwright project when such logic exists.
Playwright cannot directly run C# unit tests; a different runner requires an
explicit team decision. Add meaningful success and failure cases as features land.

CI mode rejects test.only, uses one worker, and retries twice. Local runs do not
retry. Reports in playwright-report and artifacts in test-results are ignored by
Git and ESLint. Traces/screenshots are retained for failures and can contain
sensitive data when authenticated scenarios are later introduced.

Type checking generates Next.js route types and checks the web app plus the root
Playwright configuration/tests. Playwright transpilation alone is not type checking.
C# uses nullable checking and warnings as errors. There is no standalone JS/TS
formatter configured; C# formatting uses dotnet format.

This development testing policy does not expand the product's limited verification
feature. Passing tests are evidence, not automatic requirement acceptance.
