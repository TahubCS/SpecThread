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
password-protected database on a random loopback port, applies the versioned SQL
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
issuer. Auth tests also start extra API instances on 5102-5104, product API tests
on 5105, the web-test product API on 5106, Teams API tests on 5107, management on
5108, and invitations on 5109. Keep these
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
  placeholder pages, a useful 404 for an unknown URL, the personal/team project
  descriptions, and a route walk
  from Dashboard through a project, requirement, evidence, and review.
  These checks do not imply that product data or authorization are implemented.
  Teams creation/list/overview is covered separately with real data rather than
  the former example-team navigation. Other product routes remain scaffold checks.
- API: health response without database credentials, development OpenAPI, and
  unknown routes (401 anonymous, 404 authenticated).
- API JWT validation: valid tokens identify the user; missing, malformed,
  expired, wrong-issuer, wrong-audience, no-expiry, unpublished-key, HS256, and
  alg-none tokens are rejected; missing subjects are forbidden; a missing
  Auth:Issuer fails explicitly. The test issuer generates keys per run.
  The schema suite validates a real Better Auth ES256 token against the API after
  expiring a legacy EdDSA key.
- Product API: team-owned creation/list/rename/archive/restore, Owner/Admin management,
  Member requirement editing, inherited member reads, revoked access after team
  removal, inactive legacy memberships, retired membership writes, isolated team
  project/archive lists, and active requirement counts. Ordered criteria/stale-version
  and archived-item checks remain. OpenAPI and anonymous checks run without a DB.
- Teams: real API-backed creation, search, empty/error/retry and member-only access;
  reference Home, independent saved sidebar groups, personal favorites sorting first,
  keyboard team menu, and desktop/mobile screenshots. Required onboarding resumes
  across protected routes and closed browser sessions. API checks cover atomic first
  creation, concurrent submissions (one 201/one 409), completion surviving membership
  loss, and unbypassable project creation guard. Sidebar routes never expose JWTs.
  Web-test API 5106 shares the disposable DB and trusts the real Better Auth origin;
  schema API 5107 verifies roles, private preferences, RLS/grants, and rollback.
- Team projects: compact real-data browser table, active/archive isolation, links to
  the existing project page, member-only page access, and mobile overflow checks.
  Archive restoration covers named confirmation/cancel, active-list refresh,
  Member read-only controls, and an Admin demoted while confirmation is open.
  Legacy migration tests preserve separate collaborator sets, owner fallback,
  timestamps, requirements/criteria, and existing teams. They verify required FK,
  onboarding backfill, and nondestructive association rollback/reapply.
  Member/settings checks cover role Save, read-only permissions, name/description
  validation, named removal/leave/transfer dialogs, cancellation/Escape/focus,
  post-transfer roles, lost access after leave, and concurrent mutation invariants.
  Invitation checks cover the Members dialog, Copy link, manager roles, the real
  invitation table, resend/revoke and unavailable states, focused mobile acceptance,
  wrong-account sign-out, and onboarding remaining required before acceptance.
  Schema tests cover hashed secrets, seven-day expiry, email normalization, current
  inviter permissions, verification/matching email, single-use/idempotent acceptance,
  concurrent accepts/revoke, cross-team isolation, RLS/grants, and rollback/reapply.
  Real Better Auth signup/verification with captured mail preserves the invitation
  destination and joins only the invited team without initial-team creation.
  Invitation tests use the loopback log sender or captured messages, never live mail.
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

Live OAuth and deployed TLS connectivity are not tested. Teams, onboarding, and
team Projects/archive have browser coverage against the disposable database;
global project flows remain API or scaffold checks owned by Claude. The health endpoint is liveness, not database
readiness. EF initialization is not proof that live database credentials work.

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
