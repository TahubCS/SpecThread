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
web app at 127.0.0.1:3100 and the API in Development at 127.0.0.1:5100. Keep both
ports free; existing servers are not reused. Do not run competing Next.js builds
or development processes in this checkout: they share app/web/.next. Google Fonts
currently require network access during the web build.

## Current coverage

- Chromium: home/dashboard navigation, keyboard skip link, login/signup navigation,
  disabled authentication and data actions, and all four routes at mobile width.
  Desktop/mobile screenshots are saved inside the ignored test-results directory.
- API: health response without database credentials, development OpenAPI, and
  a 404 for an unimplemented route.
- EF: PostgreSQL provider initialization using dummy credentials at an unreachable
  local address, and explicit rejection when connection configuration is missing.
  These invoke the local dotnet-ef tool and never connect to Supabase.

No product flows, live database queries, or migrations are tested yet. The health
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
