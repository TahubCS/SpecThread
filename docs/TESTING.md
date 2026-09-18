# Testing SpecThread

Playwright Test is the shared runner for all automated behavior tests. Linting,
TypeScript checking, and production builds remain separate quality checks.

## Setup

Run these commands from the repository root with Node.js and npm installed:

```sh
npm ci
npx playwright install chromium
```

The current setup was prepared with Node.js 24.13.0 and npm 11.7.0. On Linux CI,
use `npx playwright install --with-deps chromium` to install browser system
dependencies as well. Repeat browser installation after updating Playwright.

## Commands

```sh
npm test                 # Build the app, start it, and run all tests
npm test -- --list       # Discover tests without building or starting the app
npm test -- --headed     # Run with a visible browser
npm run test:ui          # Open Playwright's interactive test UI
npm run test:report      # Open the most recently generated HTML report
npm run lint
npm run typecheck
npm run build           # Standalone production build; also run by npm test
```

`typecheck` generates Next.js route types before running TypeScript. Playwright
transpiles tests but does not replace this check. No standalone formatter is
currently configured.

## Configuration and current coverage

- `playwright.config.ts` discovers tests under `tests/` and uses Chromium.
- `tests/e2e/home.spec.ts` checks the existing starter homepage's HTTP response,
  title, heading, and documentation link. Update this smoke test when that page
  changes. There are no product flows or API tests yet.
- Playwright builds the current source and starts a production server at
  `http://127.0.0.1:3100`. Keep port 3100 free. It deliberately fails when another
  server occupies the address, rather than testing an unknown process.
- Allow up to three minutes for build and startup. Avoid running a separate
  Next.js build or development server in this checkout during tests because
  they share `.next/`. The existing Google Fonts imports require network access
  during the build.
- CI mode rejects `test.only`, uses one worker, and retries failures twice. Local
  runs do not retry. This configuration does not create a GitHub Actions workflow.
- HTML reports go to `playwright-report/`; failure screenshots and traces go to
  `test-results/`. These generated directories are ignored by Git. Treat traces
  as potentially sensitive when future scenarios involve authenticated data.

## Adding tests

Use `@playwright/test` for every automated behavior test. Put browser scenarios
in `tests/e2e/*.spec.ts`. Use accessible locators and retrying assertions rather
than arbitrary sleeps. Test only explicit, implemented behavior and isolate
test data when persistence is added.

Future HTTP API tests should use Playwright's `request` fixture under
`tests/api/`. Add the API server and its agreed URL to the configuration when
the API exists; no backend or API contract is created by this setup. Directly
testable TypeScript logic can use browser-free tests under `tests/unit/` with
the same runner. The current single project starts the web server for every
test run; separate projects can be introduced when these other suites exist.

Playwright cannot directly run C# unit tests. Exercise API behavior through HTTP;
record a team decision if direct C# unit coverage later requires another runner.
Do not silently introduce Jest, Vitest, xUnit, or another test framework.

This development-testing policy is separate from SpecThread's product feature
for collecting selected verification results. Passing tests are evidence, not
automatic acceptance of a requirement.

References: [Playwright configuration](https://playwright.dev/docs/test-configuration),
[web server setup](https://playwright.dev/docs/test-webserver), and
[browser installation](https://playwright.dev/docs/browsers).
