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
issuer. Auth tests also start extra API instances on 5102-5104, and product API tests on 5105.
scripts/start-test-web.mjs also starts the API on 5106 for browser tests. That instance uses
the web test database and trusts the test web app as its token issuer. The web app
reaches it through a test-only proxy on 5107 (scripts/test-api-proxy.mjs), set as
SPECTHREAD_API_URL. The test API talks to a stand-in for GitHub on 5108
(scripts/test-github.mjs) with an app key generated for the run; tests describe what
one user's GitHub token can see with tests/support/github.ts and never reach the
real GitHub. The repository API tests use their own stand-in on 5109 and API
instances on 5110 and 5111. A test calls `failApi` from tests/support/api-faults.ts to make the
API fail, drop the connection, answer with a wrong body, or respond slowly for that
test's own user only, so parallel tests are unaffected. Keep these
ports free; existing servers are not reused. Do not run competing Next.js builds
or development processes in this checkout: they share app/web/.next. Google Fonts
currently require network access during the web build.

## Current coverage

- Chromium: home/dashboard navigation, keyboard skip link, login/signup navigation,
  GitHub buttons, labeled dashboard preview tabs and evidence expansion, shared
  sidebar route transitions, workspace and settings sidebar selection, the profile
  menu (signed out, loading, signed in, and failed log out), and scaffold/auth
  pages at mobile width. Desktop/mobile screenshots are saved inside the ignored
  test-results directory.
- Landing page: navbar links to the About and How it works sections, redirects
  from the former About pages, public Privacy and Terms pages without the app
  sidebar, the hero animation with its pause control, evidence gathering and
  replay, the review decision on scroll, finished states under reduced motion,
  the signed-in Dashboard link, and narrow-screen layout and menu.
- Route protection: signed-out redirects to login with the requested path for each
  route family and unknown URLs, forged and revoked sessions, public pages and their
  images, return to the requested page after email and social sign-in, and
  `safeNextPath` rejection of other origins, control characters, over-long values,
  and login/signup loops.
- Route scaffold: navigation to the Teams area, representative static and dynamic
  placeholder pages, a useful 404 for an unknown URL, a route walk through the team
  pages, and planned-page links that never point at an example project.
  These checks do not imply that product data or authorization are implemented.
- Projects (browser, real API on port 5106): the empty list for a new user, creating a
  project and landing on its overview, ordering by name, a blank name rejected with a
  message, keyboard submission, and the narrow layout. Project workspace: the details
  panel, recent requirements and the Requirements tab with rows seeded through SQL,
  the absence of a members page (ADR-031), a planned section inside the project frame,
  rename with a rejected blank
  name, archive after confirmation and the archived read-only state, a non-owner member
  seeing no rename or archive controls, and not-found for non-members, unknown IDs, and
  malformed IDs. The api project checks response parsing for projects, requirements, and
  members, name limits, UUID-shaped IDs, date formatting, and reading field messages
  from problem details.
- Project failures (browser, through the test proxy): the list and every project
  section showing the error page for a 500, a dropped connection, a rejected token, and
  a malformed body, with "Try again" recovering; create, rename, and archive keeping
  the input and showing the right message for 400, 403, 404, 409, 500, a dropped
  connection, and a malformed success body; the loading message for slow calls, with
  the project frame kept while a tab loads; a form submitted after the session ended
  going to sign-in without creating anything; and a removed member seeing not-found.
  Not exercised: the API being slow enough to hit a platform timeout, and two owners
  renaming at the same moment.
- Requirements (browser, real API through the test proxy): creating with ordered
  criteria, removing a criterion, blank title and blank criterion messages, editing
  with the version rising, a second save refused after someone else saved, archive
  after confirmation and the archived read-only state, an archived project hiding all
  change controls and refusing a form that was already open, not-found for other
  users, wrong-project addresses, and malformed IDs, keyboard entry and the narrow
  layout. Failures: create, save, and archive each with a 500, a dropped connection,
  a 404, and a malformed success body, keeping what was typed; API field messages
  shown next to the title and the right criterion; and a failing requirement page
  showing the error inside the project frame and recovering. The api project checks
  requirement parsing, input trimming and limits, and mapping problem details to
  fields. Not exercised: 50 criteria through the browser, and two saves landing in
  the same instant.
- GitHub repository connection (ADR-032). Browser: connecting, seeing the repository
  across the project, and disconnecting after confirmation; no linked GitHub account;
  a rejected GitHub sign-in; no installation; the choice kept after a refused attempt;
  a repository or installation that disappeared; non-owners and archived projects
  seeing it read-only; GitHub down, rate limiting, dropping connections, or answering
  wrongly while listing and while connecting; API failures while connecting and
  disconnecting; and the error page inside the project frame. API (schema suite):
  owner-only changes, 404 for non-members, refusing other users' installations and
  repositories and mismatched pairs, input validation, paging past 100 repositories
  and the 500 limit, 502 and 503 mapping, missing app credentials, anonymous 401, the
  user's token never being stored, and the migration's RLS, constraints, and rollback.
  Not exercised: the real GitHub, and an expired GitHub token being refreshed.
- API: health response without database credentials, development OpenAPI, and
  unknown routes (401 anonymous, 404 authenticated).
- API JWT validation: valid tokens identify the user; missing, malformed,
  expired, wrong-issuer, wrong-audience, no-expiry, unpublished-key, HS256, and
  alg-none tokens are rejected; missing subjects are forbidden; a missing
  Auth:Issuer fails explicitly. The test issuer generates keys per run.
  The schema suite validates a real Better Auth ES256 token against the API after
  expiring a legacy EdDSA key.
- Product API (schema suite, real API on port 5105 against Docker Postgres, tokens from
  the test issuer): project create/list/rename/archive, owner membership, member versus
  owner rights, 404 for non-members, ordered criteria replacement, stale-version 409,
  archived-item 409s, validation errors, anonymous 401, and accounts without a user row.
  Member management covers these cases: adds by email that ignore case, duplicate and
  unverified or unknown emails, owner-only adds and removals, members leaving and
  losing access, and refusing to remove the owner.
  The api project checks the OpenAPI paths and anonymous 401s without a database, and
  `apiBaseUrl` validation for SPECTHREAD_API_URL. A concurrent-save race (as opposed to a
  stale version sent by the client) is not exercised.
- EF: PostgreSQL provider initialization using dummy credentials at an unreachable
  local address, and explicit rejection when connection configuration is missing.
  These invoke the local dotnet-ef tool and never connect to Supabase.

- Email/password and linking (schema suite, real Better Auth on Docker Postgres,
  captured emails): hashed credentials, verification required before sign-in,
  verify links sign in, duplicate sign-up and unknown-email reset look identical,
  single-use resets that revoke sessions, link-social for GitHub and Google,
  refusal to unlink the last method, and refusal to unlink when only a disabled
  provider would remain. Browser tests cover the forms, errors, 429,
  resend, reset pages, /account redirect, linking error messages, and narrow
  screens with mocked auth responses. Real Google/GitHub linking callbacks and
  Resend delivery are verified manually.
- Auth: explicit configuration failures, email delivery and provider enablement rules, verified TLS options, restricted origins,
- Auth: explicit configuration failures, verified TLS options, restricted origins,
  CA PEM parsing/bundles, complete GitHub credential pairs,
  session endpoint, HTTP rejection of unrelated origins, proxy header precedence,
  retryable HTTP/network failures, provider redirection, and a safe public error page.
  An active session redirects login and signup to Dashboard; an invalid cookie
  does not. The browser test creates a disposable user/session in the isolated
  web-test database and shares one random test secret across Playwright workers.
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

Live OAuth, deployed TLS connectivity, and browser product flows are not tested. The health
endpoint is liveness, not database readiness. EF initialization is not proof
that live database credentials work.

## Conventions

Use browser fixtures in tests/e2e and request fixtures in tests/api. Browser tests
import `test` from `tests/e2e/fixtures.ts`, which signs each test in with a real seeded
session by default. Signed-out tests set `test.use({ signedIn: false })`. Tests that
log out must create their own session with `createTestSession`, because the default
session is shared per worker. Use accessible
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
