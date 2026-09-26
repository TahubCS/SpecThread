# Shared handoff

## Current task: Resolve PR #7 conflicts with main (2026-09-26)

- Branch: `scaffolding`; merge of `origin/main` (`077b80d`) is resolved locally
  and remains uncommitted.
- Completed: combined the scaffold's `AppFrame` and session redirects with the
  email, Google, and GitHub auth forms from main. Account navigation now opens
  `/account`. Preserved the local docstring review note below, reconciled the
  architecture summary, and assigned unique ADR numbers 015 through 020.
- Changed files: merge updates across web auth, tests, and docs; manual conflict
  resolutions in `app/web/src/app/layout.tsx`, `app/web/src/app/{login,signup}/page.tsx`,
  and `docs/{ARCHITECTURE,HANDOFF}.md`, plus account links,
  `docs/DECISIONS.md`, and `tests/e2e/auth.spec.ts`.
- Decision: retain the scaffold's route structure and preview while adopting
  main's newer sign-in methods and account management.
- Verification: `npm run lint`, `npm run typecheck`, and `npm test` passed (81
  tests). The focused active-session navigation test passed after its account
  link assertion was added. The test runner logged a database disconnect during
  disposable database teardown after the tests passed.
- Known limits: the resolution is local until committed and pushed. Deployment
  still needs the email configuration described in `docs/DEPLOYMENT.md`; live
  OAuth and email flows remain unverified here.
- Exact next step: review the staged merge resolution, then commit and push it
  only with explicit user approval; GitHub PR #7 requires the updated branch
  before it can be merged into `main` through the PR.

## Current task: Review PR docstring coverage (2026-09-26)

- Branch: `scaffolding`; CodeRabbit committed the docstring update as `f898fef`.
- Completed: reviewed the generated JSDoc across 82 frontend files and
  synchronized the local branch with that commit. Route-page comments identify
  placeholders; shared-component and route-helper comments describe behavior
  and sample-data limits.
- Changed files: CodeRabbit changed frontend pages, shared components, and
  `app/web/src/lib/scaffold-routes.ts`; this handoff is the only local edit.
- Decision: keep the documentation update on the existing PR. It does not
  change runtime behavior.
- Verification: `npm run lint`, `npm run typecheck`, and
  `git diff --check 3e0517e..HEAD` passed locally. The PR `verify` workflow
  passed on `f898fef`.
- Known limits: CodeRabbit's 0% pre-merge comment is stale because its next
  review was skipped pending manual review; the updated percentage is unverified.
  A separate CodeRabbit task for two review comments reported that its changes
  were ready but delivery needed attention; no second commit reached this branch.
- Exact next step: obtain a fresh CodeRabbit review for the docstring metric,
  inspect the separate task's delivery issue, and commit this handoff only with
  user approval.

## Current task: Fix scaffold navigation test after landing redesign (2026-09-26)

- Branch: `scaffolding`.
- Completed: start the main product navigation test at `/dashboard`, where the
  product sidebar containing the Teams link now appears. The public landing page
  has separate navigation.
- Changed files: `tests/e2e/scaffold.spec.ts` and this handoff.
- Decision: preserve the distinct public and product navigation; the test now
  enters the product area before asserting its links.
- Verification: `npm run lint` and `npm run typecheck` passed. The focused
  Playwright test passed (1 test), and `npm test` passed all 64 tests, including
  web and API test builds. The test runner printed a PostgreSQL disconnect
  warning during disposable database teardown after the tests passed.
- Known limits: the CI run for this uncommitted fix has not been observed.
- Exact next step: review the diff, then commit and push the fix to the open
  pull request with explicit user approval for the commit.

## Current task: Implement the landing page layout and navigation (2026-09-25)

- Branch: `scaffolding`; follows public page design concepts.
- Completed: implemented the simplified landing page based on `docs/landing-design/landing-v2.png`, including the dark charcoal hero, lavender accent typography, interactive ST-104 evidence thread demo, dedicated landing navigation with session awareness and mobile menu, and quiet landing footer. Removed leftover v1 demo captions and aligned styling to the v2 concept.
- Changed files: `app/web/src/app/page.tsx`, `app/web/src/app/landing.css`, `app/web/src/app/layout.tsx`, `app/web/src/components/app-frame.tsx`, `app/web/src/components/main-navigation.tsx`, `tests/e2e/home.spec.ts`, and this handoff.
- Decisions and assumptions: render `LandingNavigation` and the quiet landing footer specifically when `pathname === "/"`; keep the evidence demo deterministic without client-side mock churn; support narrow screens down to 390px using native `<details>` for mobile navigation.
- Verification: `npm run typecheck` and `npm run lint` both passed with 0 errors. Home and narrow-screen Playwright tests are defined in `tests/e2e/home.spec.ts` (full browser test execution requires local Docker daemon for Better Auth test database).
- Known limits: authentication pages (`/login` and `/signup`) remain on the previous scaffold and have not yet been updated to match `docs/landing-design/{login-v2,signup-v2}.png`.
- Exact next step: review and approve changes, then decide whether to proceed with updating the `/login` and `/signup` authentication pages.

## Current task: Simplify the public page concepts (2026-09-25)

- Branch: `scaffolding`; no application code was changed.
- Completed: revised all three public-page concepts with less visual weight and
  saved the new versions next to the original images in `docs/landing-design/`.
- Changed files: `docs/landing-design/{landing-v2,login-v2,signup-v2}.png`,
  `docs/landing-design/README.md`, and this handoff.
- Decisions and assumptions: retain the dashboard's charcoal/lavender language,
  the requirement-to-review thread, and GitHub-only authentication. The revised
  set is the current proposal; the originals remain for comparison.
- Verification: visually inspected each generated image and checked its local
  file and README link. No app build or test was needed for image-only changes.
- Known limits: image-generated copy and icons need review during implementation;
  the concepts remain desktop-only and are not implemented pages.
- Exact next step: collect feedback on the simpler set before implementing
  responsive, accessible landing and authentication pages.

## Current task: Public page design concepts (2026-09-25)

- Branch: `scaffolding`; no application code was changed for this task.
- Completed: generated matching landing, login, and signup visual concepts and
  saved them with relative links in `docs/landing-design/` for team review.
- Changed files: `docs/landing-design/{README.md,landing.png,login.png,signup.png}`
  and this handoff.
- Decisions and assumptions: continue the dashboard's charcoal and lavender
  visual language; show an inspectable evidence path; preserve GitHub-only auth.
  The images are proposals, not accepted UI specifications.
- Verification: inspected each image for layout and product-language fit. The
  first landing draft had extra panels; its saved revision removes them. No app
  build or test was needed because this task changes only design artifacts.
- Known limits: image-generated text and icons need normal implementation review;
  the concepts are desktop views and do not define responsive layouts.
- Exact next step: get the team's feedback on these concepts, then implement
  the selected direction with responsive and accessible behavior.

## Current task: Show the brand mark in the public header (2026-09-25)

- Branch: `scaffolding`; this follows the browser icon correction.
- Completed: the landing page and other public pages now show the existing
  SpecThread thread mark beside the brand name in the shared header.
- Changed files: `app/web/src/components/app-frame.tsx`,
  `app/web/src/app/globals.css`, `tests/e2e/home.spec.ts`, and this handoff.
- Decision: reuse the same image as the product sidebar and browser tab.
- Verification: `npm run lint` and `npm run typecheck` passed. The focused
  Playwright home-to-dashboard browser test passed (1 test); its public-header
  image assertion and screenshot confirm that the mark loads.
- Known limits: the landing page body is still the initial light scaffold and
  has not received a broader design pass.
- Exact next step: confirm whether the user wants a full landing page redesign;
  if so, treat it as a separate visual feature and retain the shared header.

## Current task: Replace the template browser icon (2026-09-24)

- Branch: `scaffolding`; this is a follow-up to the dashboard shell work.
- Completed: removed the default Next.js/Vercel `favicon.ico` and installed
  the existing SpecThread thread mark as the root App Router `icon.png`.
- Changed files: `app/web/src/app/favicon.ico` (removed),
  `app/web/src/app/icon.png` (added), `tests/e2e/home.spec.ts`, and this handoff.
- Decision: reuse `app/web/public/thread-mark.png` so the browser tab and
  product sidebar show the same brand mark; no additional image dependency.
- Verification: `npm run lint` and `npm run typecheck` passed. The focused
  Playwright browser test passed (1 test), including the web and API test builds
  and an assertion that the page emits the new `/icon.png` metadata link.
- Known limits: browsers may retain an old tab icon until they reload the page.
- Exact next step: continue the project and requirement data contract work;
  merge branch changes through a pull request, not directly into `main`.

## Current task: Build the dashboard shell and preview (2026-09-24)

- Branch: `scaffolding`; the shell is committed as `9b7f652` and the dashboard
  preview as `a68e465`. The QA artifacts and documentation are in a separate
  follow-up commit.
- Completed: replaced the dashboard cards with the approved compact work list and
  inline evidence path. Product routes now share a persistent dark sidebar and
  route header; public pages retain their existing header and footer. Dashboard
  tabs, row expansion, group collapse, sorting, filtering, quick navigation,
  mobile drawer, and links to existing example routes work. Sample requirements
  and the example team are explicitly labeled as preview content.
- Changed files: `app/web/src/{app/{layout,globals.css,app-shell.css,dashboard/page.tsx},components/{app-frame,dashboard-preview}.tsx}`,
  `app/web/public/thread-mark.png`, `app/web/package.json`, `package-lock.json`,
  `tests/e2e/{home,scaffold,auth}.spec.ts`, `docs/assets/thread-mark-source.png`,
  `docs/dashboard-qa/` (the QA report and three image artifacts),
  `scripts/process-thread-mark.py`, and `docs/{ARCHITECTURE,DECISIONS,TESTING,HANDOFF}.md`.
- Decisions: ADR-020 records the shared shell and public sample preview. Added
  `lucide-react` because the web app had no reusable icon set; no API, schema,
  session, or authorization behavior changed. The transparent brand mark is
  produced from `docs/assets/thread-mark-source.png` with
  `python scripts/process-thread-mark.py` (requires Pillow).
- Verification: browser inspection covered desktop and 390px mobile layouts,
  evidence expansion, tabs, and a route transition. `npm test` passed 63 tests,
  including the web and API builds. The focused dashboard suite passed 8 tests
  after the tab refinement and console-error assertion; the final screenshot
  test passed after the logo update. `npm run lint`, `npm run typecheck`, and
  standalone `npm run build` passed on the final code. Asset regeneration passed.
  `git diff --check` and the final diff review passed. The design QA report and
  its source, implementation, and comparison images are stored together in
  `docs/dashboard-qa/` with relative links.
- Known limits: dashboard rows and team navigation are examples, not account data.
  Project authorization and real requirement APIs are still pending. The current
  product routes remain public and must be protected before showing private data.
- Exact next step: define the authorized project and requirement read contract,
  then replace the preview rows and example team with real accessible data. Do
  request explicit approval for future commits; merge through a pull request only.

## Current task: Navigate the frontend scaffold (2026-09-24)

- Branch: `scaffolding`, continuing the user's routing work. Changes remain
  uncommitted; no CSS or backend product endpoint was changed.
- Completed: added one route catalog and shared navigation to the dashboard and
  all placeholder pages. Parent, child, and related links connect Teams,
  personal/team Projects, Requirements, Evidence, Review, account Settings,
  onboarding, help, invitations, and optional routes. Links needing unknown IDs
  are explicitly marked as example routes. Added a Settings landing page and
  made the dashboard's Create project and Connect GitHub controls link to their
  placeholder routes. The main header now links to Notifications and Settings
  and shows Account instead of Log in/Sign up for an active client session.
- Auth behavior: login and signup use Better Auth's server-validated session to
  redirect an already signed-in user to `/dashboard`. The existing GitHub OAuth
  callback already targets `/dashboard`; no raw browser token is trusted for
  the redirect. The dashboard remains a public empty preview.
- Changed files: `app/web/src/{lib/scaffold-routes.ts,components/{scaffold-navigation,main-navigation,scaffold-page}.tsx,app/{layout,dashboard/page,login/page,signup/page,settings/page}.tsx}`;
  `playwright.config.ts`; `tests/e2e/{auth,home,scaffold}.spec.ts`;
  `docs/{ARCHITECTURE,DECISIONS,TESTING,HANDOFF}.md`.
- Decision: ADR-019 records navigation and session redirect semantics. A
  per-run random test secret is shared across Playwright workers so the
  disposable session test uses the same secret as the test web server.
- Verification: `npm run lint` and `npm run typecheck` passed. Final `npm test`
  passed 61 tests and built the web and API applications. The browser tests
  cover the main route journey, active and invalid sessions, and registration
  of all reserved pages in navigation. `git diff --check` passed.
- Known risks: pages remain public placeholders without project membership
  checks or real entity links. Example IDs exist only to exercise the route
  structure. Real GitHub OAuth, deployed session behavior, and product data
  navigation were not verified in this task.
- Exact next step: implement a real project list and authorization contract,
  then replace example links with IDs from accessible projects. Do not commit
  without explicit user approval; merge to `main` only through a pull request.

## Current task: Refine frontend route hierarchy (2026-09-24)

- Branch: `scaffolding`, continuing the route task on the user-selected branch.
  Changes are uncommitted.
- Completed: removed the speculative standalone `/search` page. Added `/about`
  as an informational hub and moved How it works, Privacy, and Terms to
  `/about/how-it-works`, `/about/privacy`, and `/about/terms`; linked the hub in
  the footer. Clarified that `/projects` covers both personal and team-owned
  projects, while `/teams/[teamId]/projects` is the team subset. Project creation
  and ownership placeholders now mention both ownership choices.
- Changed files: `app/web/src/app/about/`, removed top-level information and
  search `page.tsx` files, updated project placeholder pages and root layout,
  `tests/e2e/scaffold.spec.ts`, and `docs/{PROJECT,DECISIONS,TESTING,HANDOFF}.md`.
- Decision: ADR-018 records the route hierarchy. The user selected the About
  hub with separate child URLs. Search remains a possible control within list
  pages, with no global search route. No data-model or API contract was changed.
- Verification: `npm run lint` and `npm run typecheck` passed. `npm test` passed
  all 57 tests and built the web and API applications. `git diff --check` passed.
- Known risk: information and product pages remain placeholders. Team
  membership, authorization, personal/team ownership, and transfer behavior
  still need backend decisions and implementation. Old top-level information
  URLs now return 404; they were only scaffold pages and had no navigation links.
- Exact next step: define the first real project flow and its access rules,
  then replace the relevant placeholders. Do not commit without the user's
  explicit approval; merge to `main` only through a pull request.

## Current task: Frontend route scaffolding (2026-09-24)

- Branch: `scaffolding`, created from `main`. Changes are uncommitted. The
  pre-existing modifications to `package.json`, `package-lock.json`, and
  `skills-lock.json` were preserved and are outside this task.
- Completed: added 68 bare frontend pages from the route blueprint covering
  public help, onboarding, teams, projects, requirements, evidence, review,
  invitations, account settings, and optional future views. Each uses one
  shared placeholder that clearly says product data and actions are not
  connected. Added Teams, Projects, and Reviews header links plus root error
  and not-found fallbacks. Existing home, auth, and dashboard screens remain.
- Changed files: `app/web/src/app/layout.tsx`, 68 new route `page.tsx` files in
  `app/web/src/app/`, `app/web/src/app/{error,not-found}.tsx`,
  `app/web/src/components/scaffold-page.tsx`, `tests/e2e/scaffold.spec.ts`,
  `docs/{TESTING,HANDOFF}.md`.
- Decisions and assumptions: route paths reserve navigation only and are not
  API or data-model contracts. A team-owned project is a proposed product
  direction; team ownership, membership, invitations, review permissions, and
  authorization remain undecided. Dynamic placeholder routes intentionally
  show no real entity data and do not validate IDs yet. No new dependencies,
  database changes, or backend endpoints were added.
- Verification: `npm run lint` and `npm run typecheck` passed. `npm run build`
  passed with network access for the existing Google Fonts imports. Focused
  scaffold Playwright tests passed (2 tests before the 404 test was added),
  and the final full `npm test` passed (54 tests, including all 3 scaffold
  tests). Final lint and typecheck passed after the last code edit;
  `git diff --check` passed. Docker Desktop was started for the disposable
  test database.
- Known risks: all new pages are publicly reachable placeholders. They must
  gain real session and project authorization checks before showing product
  data. Later feature routes should be removed if the team rejects them.
- Exact next step: choose the first vertical slice and settle team ownership
  and review permissions before connecting these pages to product data. Keep
  this branch uncommitted until the user approves a commit; use a pull request
  for any merge into `main`.

## Current task: Email/password and Google sign-in with account linking (2026-09-25)

- Branch: feature/email-google-auth (from main). Committed and opened as a PR. Nothing deployed; no database schema changes.
  - Independent of the open feature/api-jwt-validation PR, which uses ADR-015. This task uses ADR-016.
  - Restored app/web/.env.example from main to document the new variables. The app/api/.env.example working-tree deletion was left untouched.
- Completed:
  - Better Auth email/password sign-in: verification required, 12-character minimum, verify links sign in, single-use reset links that revoke sessions.
  - Google sign-in, enabled only when configured. GitHub sign-in kept.
  - `/account` shows the profile and lets users link or unlink Google and GitHub, and sign out.
  - Unlinking must leave a usable method, meaning email/password or a provider enabled in this deployment. Enforced both in the UI and by a server hook on `/unlink-account` (PR review follow-up).
  - New `/forgot-password` and `/reset-password` pages; login and signup forms; fixed linking error messages; an Account nav link.
  - Email is sent through Resend with `fetch`, or logged on loopback only with `EMAIL_DELIVERY=log`.
- Changed files:
  - Web library: app/web/src/lib/{auth-config.ts,create-auth.ts,email.ts}
  - Web components: app/web/src/components/{auth-form.tsx,password-forms.tsx,account-panel.tsx}; auth-placeholder.tsx removed
  - Web pages: app/web/src/app/{login,signup,forgot-password,reset-password,account,auth/error}/page.tsx, layout.tsx, globals.css
  - Config: app/web/.env.example, playwright.config.ts
  - Tests: tests/api/auth-config.spec.ts, tests/e2e/{auth,home}.spec.ts, tests/schema/{auth-email,auth-runtime}.spec.ts
  - Docs: README.md, docs/{ARCHITECTURE,DECISIONS,DEPLOYMENT,TESTING,HANDOFF}.md
- Decisions: ADR-016.
  - Implicit linking by email keeps Better Auth's default: both the provider and the local account must have verified the email.
  - Explicit linking allows a GitHub or Google email that differs from the account email.
  - Duplicate sign-up and reset requests give the same response, so they don't reveal which emails exist.
  - No migration was needed; the existing tables cover it.
- Verification:
  - `npm run lint`: passed. `npm run typecheck`: passed.
  - `npm test`: 48 passed, including 5 new schema flow tests, 7 new browser tests and 2 new config tests.
  - `npm run build`: passes with `EMAIL_DELIVERY=log`. It fails explicitly without Resend settings, as designed.
  - `git diff --check`: passed.
  - Manual: a real Resend verification email from mail.spec-thread.com was received locally. The web app pointed at the shared Supabase database during this test, so test sign-ups exist there.
- Known issues or risks:
  - **Vercel deploys now fail until `RESEND_API_KEY` and `EMAIL_FROM` are set.** Google needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
  - Local `.env.local` needs `EMAIL_DELIVERY=log`, or Resend settings.
  - The team GitHub App is private, so non-owners get a 404 until it is made public (DEPLOYMENT.md).
  - Not automated, so still to be verified manually: real Google and GitHub linking callbacks, implicit linking, and Resend delivery.
  - Unlinking requires a recent sign-in (Better Auth's fresh-session rule).
  - After sign-in, users still land on the public dashboard preview.
- Exact next step:
  - Before merging, a teammate with Vercel access sets `RESEND_API_KEY`, `EMAIL_FROM` (sender on mail.spec-thread.com) and, optionally, the Google credentials, and makes the GitHub App public.
  - Still to verify manually: verify link then password login, password reset, linking GitHub or Google from `/account`, and Google sign-in.

## Current task: API JWT validation (2026-09-23)

- Branch: feature/api-jwt-validation, merged into main through PR #5 (840ed6a). Nothing was deployed and no Supabase changes were made.
  - better-auth stays pinned to exactly 1.7.5. A commit loosening it to ^1.7.5 (fe77b92) was reverted in 7188a73, because the key-selection behavior behind the rollout was verified only against 1.7.5.
  - Deleted app/web/.env.example and app/api/.env.example remain uncommitted in the working tree. They predate this task and are not part of it.
- Completed:
  - Better Auth now signs JWTs with ES256 (`app/web/src/lib/create-auth.ts`).
  - The API validates `Authorization: Bearer` tokens against `{Auth:Issuer}/api/auth/jwks` (`app/api/Auth/`).
  - Every endpoint requires authentication by default. `/health` and development OpenAPI stay anonymous.
  - New `GET /me` endpoint returns `{ "userId": sub }`.
- Changed files:
  - API: app/api/{Program.cs,SpecThread.Api.csproj,packages.lock.json}, app/api/Auth/{AuthenticationSetup.cs,JwksRetriever.cs}
  - Web: app/web/src/lib/create-auth.ts
  - Tests: scripts/start-test-jwks.mjs, playwright.config.ts, tests/api/{auth-jwt,auth-unconfigured,health}.spec.ts, tests/schema/auth-jwt-runtime.spec.ts, tests/support/api-process.ts
  - Config and docs: render.yaml, README.md, docs/{ARCHITECTURE,DECISIONS,DEPLOYMENT,TESTING,HANDOFF}.md
- Decisions: ADR-015.
  - ES256 instead of EdDSA, because .NET can't validate EdDSA without an extra library.
  - Public keys come from the JWKS endpoint over HTTP, not from the jwks table.
  - Endpoints are authenticated by default. Anonymous callers now get 401 on unknown routes instead of 404; this changed the existing health.spec test.
  - `/me` is a proposed contract, and the team may rename it.
  - Local manual testing needs its own database and GitHub OAuth app: the shared Supabase jwks table still holds EdDSA keys, and the team's GitHub App is private (other GitHub users get a 404 at authorize).
- Verification:
  - `npm run lint`, `npm run typecheck`, and `npm run build:api` all passed (0 warnings).
  - `npm test`: 48 passed. Docker Desktop had to be started, and Playwright Chromium and dotnet tools had to be installed or restored locally first.
  - `git diff --check` passed.
  - Manual check: local web app on a Docker Postgres with a personal GitHub OAuth app. A real ES256 token returned 200 from `GET /me` with the matching user id; the request without a token returned 401.
- Known issues or risks:
  - Production needs the ordered rollout in DEPLOYMENT.md: deploy the web change, expire the EdDSA keys, then set `Auth__Issuer` on Render.
  - The API's key refresh depends on the web app's availability.
  - No web code sends tokens to the API yet.
  - Project membership checks are not implemented.
- Exact next step: carry out the ordered rollout in DEPLOYMENT.md (deploy the web change, expire the EdDSA keys, then set `Auth__Issuer` on Render). After that, implement project membership authorization.
  - Team follow-ups:
    - Make the GitHub App public if non-owners will sign in on Vercel.
    - Consider trimming the JWT payload to the user id with Better Auth's `definePayload`. By default the token carries name, email, and avatar URL.
## Current task: Skill-guided auth configuration improvements (2026-09-21)

- Branch: auth/optimize, explicitly selected; already checked out at task start.
  Changes grouped into user-authorized skills, test harness, and auth commits.
  No production deployment, live migration, credential
  rotation, or existing OAuth-token rewrite was performed.
- Completed: used better-auth-best-practices and better-auth-security-best-practices,
  verifying examples against installed 1.7.5 code/types and Context7. Added early
  PEM parsing (including certificate bundles), trimmed/paired GitHub credentials,
  and built-in encryption of newly written OAuth tokens. Removed the unused public
  URL from the env example. Preserved the existing joins, rate limits, error page,
  exact trusted origins, and verified TLS.
- Changed files: app/web/.env.example, app/web/src/lib/{auth-config,create-auth}.ts,
  tests/api/auth-config.spec.ts, tests/schema/auth-runtime.spec.ts,
  playwright.config.ts, scripts/start-test-web.mjs,
  docs/{ARCHITECTURE,DECISIONS,DEPLOYMENT,TESTING,HANDOFF}.md.
- Verification exposed an existing harness defect: globalSetup runs after the
  webServer entries, so building there tried to overwrite the running API DLL.
  The first webServer entry now builds the API before the API entry starts.
- Checks: npm run lint and npm run typecheck passed. Focused auth-runtime schema
  tests passed 6/6. Final npm test passed 37/37 in 32.0s, with production web and
  Release API builds. git diff --check passed. Current local env passed config
  validation without printing values. Initial token retrieval tests were corrected
  to use 1.7.5's internal account row ID, without providerId, in the HTTP request.
- Decision: ADR-015; no new dependencies, environment variables, or migrations.
  Encryption does not backfill historical plaintext. Keep the existing secret
  and encryption option once ciphertext has been written. Prefixed legacy GitHub
  tokens are tested; hex-only legacy tokens may need reauthentication.
- Unverified: real OAuth against GitHub and deployed proxy behavior for this branch;
  no live Supabase database was touched. Prior handoff deployment/migration claims
  are historical, not independently reverified here. The existing AuthRateLimits
  migration is still a deployment prerequisite.
- User-added canonical .agents/skills files and skills-lock.json are included in
  the skills commit without content changes. .claude/skills and skills are local
  Windows junction aliases to those files and remain untracked, avoiding duplicate
  copies in Git.
- Exact next step: push auth/optimize and open a PR when requested. Merge into
  main only through the PR. Before deployment,
  verify AuthRateLimits is applied, retain BETTER_AUTH_SECRET, and recheck live
  GitHub sign-in/cancellation using DEPLOYMENT.md.

## Previous task: Branch protection rules and PR enforcement workflow (2026-09-20)

- Branch: main (explicitly authorized one-time exception for establishing repository governance).
- Completed:
  - Updated `AGENTS.md` and `docs/WORKFLOW.md` establishing mandatory agent branching instructions:
    - Never edit or commit directly on `main`.
    - Detect `main` and immediately warn the user and prompt for a task branch name before making any changes.
    - On task branches, distinguish prompt iterations on the current task (stay on branch) from starting a different task (ask whether to stay or create a new branch).
    - Mandatory Pull Requests for merging all code into `main`.
  - Added `.github/workflows/enforce-pr.yml` CI workflow that validates any push to `main` originated from an associated, merged Pull Request (with `[skip-pr-check]` bypass flag for authorized emergency/setup commits).
- Changed files: `AGENTS.md`, `docs/WORKFLOW.md`, `.github/workflows/enforce-pr.yml`, `docs/HANDOFF.md`.
- Verification: `npm run lint` and `npm run typecheck` passed cleanly; `git diff --check` passed.
- Exact next step: User commits and pushes this configuration to `main`, and configures GitHub branch protection rules in repository settings to require Pull Requests.

## Previous task: Better Auth error handling, joins, and shared rate limits (2026-09-20)

- Branch: main, explicitly selected. Changes remain uncommitted; no live deployment or Supabase migration performed.
- Completed:
  - Added public `/auth/error` page (`app/web/src/app/auth/error/page.tsx`) rendering safe, sanitized error descriptions distinguishing user cancellation (`access_denied`), expired OAuth state (`state_not_found`/`state_mismatch`), and generic provider errors, with links to retry sign-in or return home.
  - Added `onAPIError: { errorURL: "/auth/error" }` in Better Auth configuration and `errorCallbackURL: "/auth/error"` when initiating social sign-in.
  - Updated `AuthPlaceholder` (`app/web/src/components/auth-placeholder.tsx`) to handle returned Better Auth errors (including HTTP 429 throttling and network errors) and preserve loading state during redirection.
  - Set `appName: "SpecThread"` in Better Auth server configuration.
  - Enabled Kysely PostgreSQL adapter `joins: true` and added session join integrity, expired/revoked session checks, and timing benchmark attachments to schema test reports.
  - Added shared rate-limiting storage via EF Core: added `AuthRateLimit` model to `app/api/Data/AuthModels.cs` and `SpecThreadDbContext.cs`, scaffolded migration `20260921021458_AuthRateLimits` with Row-Level Security (RLS) enabled and anon/authenticated permissions revoked, and generated idempotent forward/rollback SQL scripts (`docs/schema/auth-rate-limits.sql` and `auth-rate-limits-rollback.sql`).
  - Added test database automation (`scripts/test-database.mjs`, `scripts/start-test-web.mjs`, and `scripts/stop-test-web-database.mjs`) supporting ephemeral Docker PostgreSQL testing for web and schema suites, resilient against UTF-8 BOMs in SQL migration files.
  - Resolved CodeRabbit review feedback: added `scripts/build-api.mjs` via `globalSetup` in `playwright.config.ts` to build the API before server startup (preventing race conditions with concurrent webServer launchers), invoked compiled API DLL directly to prevent wrapper process leaks on Windows, and moved cache file operations inside the `try` block in `scripts/start-test-web.mjs` to protect database container cleanup.
  - Added comprehensive Playwright tests in `tests/e2e/auth.spec.ts` (covering error page, retryable initiation, network failure, 429 throttling, accessibility, and narrow screen layout) and `tests/schema/auth-runtime.spec.ts` (covering rate-limit schema match, RLS enforcement, multi-instance rate limiting, OAuth cancellation, session joins, and rollback/reapply).
- Changed files:
  - `app/api/Data/AuthModels.cs`, `app/api/Data/SpecThreadDbContext.cs`, `app/api/Migrations/SpecThreadDbContextModelSnapshot.cs`
  - `app/api/Migrations/20260921021458_AuthRateLimits.cs`, `app/api/Migrations/20260921021458_AuthRateLimits.Designer.cs`
  - `app/web/src/lib/create-auth.ts`, `app/web/src/lib/auth.ts`, `app/web/src/lib/auth-client.ts`, `app/web/src/components/auth-placeholder.tsx`, `app/web/src/app/auth/error/page.tsx`
  - `docs/schema/auth-rate-limits.sql`, `docs/schema/auth-rate-limits-rollback.sql`
  - `scripts/generate-auth-rate-limits.mjs`, `scripts/start-test-web.mjs`, `scripts/stop-test-web-database.mjs`, `scripts/test-database.d.mts`, `scripts/test-database.mjs`
  - `playwright.config.ts`, `tests/e2e/auth.spec.ts`, `tests/schema/auth-runtime.spec.ts`, `tests/schema/migration.spec.ts`
  - `docs/DATABASE.md`, `docs/DECISIONS.md` (ADR-014), `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/HANDOFF.md`
- Decisions: ADR-014. Name auth app SpecThread, enable joins, use PostgreSQL shared rate-limiting storage via EF Core migration. Retain production-only rate limiting defaults. Error page is public and database-independent. Browser auth requests use the current origin.
- Verification:
  - `npm run lint`: passed cleanly.
  - `npm run typecheck`: passed cleanly across Next.js and root workspaces.
  - `dotnet build app/api --configuration Release`: passed with 0 warnings, 0 errors.
  - `npx playwright test --project=api`: 11 passed in 36.0s.
  - `npx playwright test --project=chromium`: 12 passed in 26.0s.
  - `npx playwright test --project=schema`: 11 passed in 34.1s.
  - `npm test`: all 34 tests across 7 files passed in 37.2s.
  - `git diff --check`: passed.
- Known issues or risks:
  - Live Supabase database must have the `AuthRateLimits` migration applied (`dotnet ef database update AuthRateLimits --project app/api` or via `docs/schema/auth-rate-limits.sql`) before deploying the updated web application; database outages will affect auth requests subject to rate limiting.
  - GitHub-side misconfigurations (e.g., unregistered redirect URI) display error messages directly on GitHub and cannot return to the local `/auth/error` page.
  - Real GitHub login and cancellation on live Vercel deployment must be verified following the rollout steps in `docs/DEPLOYMENT.md`.
- Exact next step:
  - Obtain user approval to commit these uncommitted changes to `main`.
  - Apply `AuthRateLimits` migration to Supabase.
  - Deploy updated web app to Vercel and verify live GitHub sign-in, cancellation, and error handling.

## Previous task: Vercel client IP headers (2026-09-20)

- Branch: main, explicitly selected. Recommendation 1 only; no commit or deployment.
- Completed: Better Auth now prefers x-vercel-forwarded-for, with x-forwarded-for
  as fallback. Added HTTP-handler tests for header precedence, distinct client
  buckets, 429 responses, fallback from absent/invalid Vercel headers, and ignoring
  unrelated Cloudflare headers. Tests use isolated in-memory limits, no live data.
- Changed files: app/web/src/lib/{auth.ts,auth-config.ts},
  tests/api/auth-config.spec.ts, docs/{DEPLOYMENT,DECISIONS,HANDOFF}.md.
- Decision: ADR-013. Trust assumes Vercel-managed ingress. Existing rate-limit
  defaults and in-memory storage are unchanged; distributed storage is deferred.
- Verification: npm run lint and npm run typecheck passed;
  npm test -- --project=api --project=chromium passed all 17 tests, including
  managed production web and Release API builds. git diff --check passed.
  The sandbox initially blocked process spawning (EPERM); the approved retry ran.
  First test run had one assertion failure: this Better Auth version uses
  X-Retry-After, not Retry-After. Corrected the assertion and reran successfully.
- Unverified: deployed proxy header handling and distributed rate limiting.
  Docker schema tests were not run; this task changes no database schema.
- Prior login follow-up: corrected the ignored local CA environment formatting;
  the user subsequently confirmed GitHub login both locally and on Vercel.
- Exact next step: review these uncommitted changes and verify header behavior in
  a controlled Vercel deployment. Wait for the user's confirmation before starting
  recommendation 2. OAuth error pages, joins, and app naming remain unchanged.

## Previous task: auth configuration fixes (2026-09-19)

- Branch: main, explicitly selected. Changes remain uncommitted; no deployment,
  production environment edits, key rotation, or database migration performed.
- Completed: removed hardcoded dashboard key and default secret fallback;
  required explicit secret/base URL/database settings; restricted trusted origins
  to the canonical app origin; enforced certificate verification for remote pg
  connections with optional DATABASE_CA_CERT PEM; made dashboard plugin opt-in.
- Playwright web server uses isolated credentials and an unreachable loopback
  database, with GitHub and dashboard integrations disabled. Added config failure,
  TLS-override, and HTTP origin rejection/acceptance tests.
- Changed files: app/web/src/lib/{auth.ts,auth-config.ts}, app/web/.env.example,
  playwright.config.ts, tests/api/auth-config.spec.ts, tests/e2e/home.spec.ts,
  README.md, docs/{ARCHITECTURE,DATABASE,DECISIONS,DEPLOYMENT,TESTING,HANDOFF}.md.
- Decisions: ADR-012; no new dependencies or changes to EF ownership. Public RLS
  tables remain unchanged. Corrected stale docs and the claim that migration SQL
  is idempotent. Historical handoff below describes earlier work, not current scope.
- Checks: npm run lint and npm run typecheck passed. Latest npm test built the
  production web and Release API successfully; all 15 non-schema tests passed.
  Schema setup failed because Docker's dockerDesktopLinuxEngine pipe was absent,
  leaving five further schema tests skipped. Launching Docker Desktop hidden and
  checking docker info did not restore the engine. No schema code was changed.
  Initial origin test was corrected to use a cookie-bearing sign-out request.
  git diff --check passed. C# sources were unchanged.
- Unverified: full schema suite in this session, real GitHub OAuth, and deployed
  TLS connectivity. Existing handoff deployment/migration reports were not
  independently revalidated. No production credentials were printed.
- Exact next steps: restore Docker engine and rerun npm test; rotate the previously
  committed Better Auth dashboard key; configure Vercel's required secret, exact
  URL, database URL, and CA PEM before deployment. If the old default auth secret
  was used, replace it too (existing sessions may need sign-in). Follow
  DEPLOYMENT.md. Obtain explicit approval before committing. C# JWT validation
  and project authorization remain separate unfinished tasks.

## Previous task: deployment configuration for Vercel and Render (2026-09-19)

- Branch: main, continuing on approved integration branch.
- Live Deployments:
  - Web (Vercel): https://web-alpha-lovat-61.vercel.app/
  - API (Render): https://specthread-api.onrender.com/
- Completed work:
  - Added .dockerignore ignoring host build artifacts (bin/, obj/), .git, .next, node_modules, and local env files for fast, clean container builds.
  - Created root multi-stage Dockerfile targeting official Microsoft .NET 10 SDK and ASP.NET runtime images, restoring in locked mode and running unprivileged as $APP_UID on port 8080.
  - Solved Supabase Root CA validation for production containers: added app/api/certs/prod-ca-2021.crt and configured the Dockerfile runtime stage to install it via update-ca-certificates into the Debian trust store (/etc/ssl/certs/ca-certificates.crt).
  - Verified Docker container build and certificate trust via openssl verify; Npgsql connects with SSL Mode=VerifyFull without requiring local file path parameters in Render environment variables.
  - Created render.yaml defining the Render Blueprint web service specification for specthread-api.
  - Added app/web/vercel.json and installed typescript in app/web devDependencies for clean isolated Vercel builds.
  - Added https://*.vercel.app to Better Auth trustedOrigins in app/web/src/lib/auth.ts for seamless cross-origin and preview authentication.
  - Authored comprehensive docs/DEPLOYMENT.md guide covering Vercel and Render step-by-step setup, environment variables, GitHub OAuth callback URLs, TLS certificate configuration, and verification.
  - Recorded ADR-010 and ADR-011 in docs/DECISIONS.md and updated docs/ARCHITECTURE.md.
- Changed files:
  - .dockerignore, Dockerfile, render.yaml, app/web/vercel.json, app/web/package.json, package-lock.json
  - app/web/src/lib/auth.ts, app/api/certs/prod-ca-2021.crt, docs/DEPLOYMENT.md, docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/HANDOFF.md
- Validation:
  - Live Render API: GET https://specthread-api.onrender.com/health returned 200 OK ({"status":"ok"}).
  - Live Vercel Web: GET https://web-alpha-lovat-61.vercel.app/ returned 200 OK with SpecThread landing page.
  - Live Better Auth: GET https://web-alpha-lovat-61.vercel.app/api/auth/get-session returned 200 OK (null for unauthenticated).
  - docker build: passed in 7.1s, 701B context transfer.
  - docker container cert verification: openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt /usr/local/share/ca-certificates/supabase-root-2021.crt returned OK.
  - npm run lint: passed cleanly.
  - npm run typecheck: passed cleanly.
  - npm run build: Next.js production build succeeded in 1.1s.
  - dotnet build app/api --configuration Release: passed with 0 warnings, 0 errors.
  - npx playwright test: 17 passed in 31.2s.
  - git diff --check: passed.
- Known issues or risks:
  - GitHub OAuth Application must have Homepage URL and Authorization callback URL configured to the live Vercel domain.
- Exact next step:
  - Update GitHub OAuth App Authorization callback URL to https://web-alpha-lovat-61.vercel.app/api/auth/callback/github, set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on Vercel, and test live GitHub authentication.

## Previous task: initial schema migration and Better Auth setup (2026-09-19)

- Branch: main, continuing the approved sequence.
- Completed work:
  - Finalized C# EF Core models in app/api/Data/{AuthModels.cs, ProductModels.cs, SpecThreadDbContext.cs}.
  - Generated and finalized EF Core migration 20260919042809_InitialSchema with embedded PostgreSQL Row-Level Security (RLS) and public/anon/authenticated role privilege revocation.
  - Generated idempotent DDL artifacts docs/schema/initial.sql and docs/schema/rollback.sql.
  - Executed dotnet ef database update applying the migration to the live Supabase PostgreSQL database via the session pooler; all 9 tables, indices, check constraints, foreign keys, and RLS policies are live.
  - Verified EF model snapshot matching and tested schema integrity, Better Auth compatibility, constraints, and rollback in an ephemeral Docker container.
  - Implemented Better Auth in app/web: installed better-auth: 1.7.5 and pg: 8.23.0 with @types/pg: 8.23.1, added app/web/src/lib/auth.ts (PostgreSQL adapter, JWT plugin, GitHub social provider, validateSchema: false), app/web/src/lib/auth-client.ts (jwtClient), and app/web/src/app/api/auth/[...all]/route.ts (toNextJsHandler).
  - Documented environment variables in app/web/.env.example.
  - Updated app/web/src/components/auth-placeholder.tsx to provide an interactive GitHub sign-in button with loading and error states.
  - Updated tests/e2e/home.spec.ts with checks for interactive GitHub buttons and Better Auth /api/auth/get-session endpoint response.
  - Recorded ADR-009 in docs/DECISIONS.md.
- Changed files:
  - app/api/Data/SpecThreadDbContext.cs, app/api/Data/AuthModels.cs, app/api/Data/ProductModels.cs
  - app/api/Migrations/20260919042809_InitialSchema.cs, .Designer.cs, SpecThreadDbContextModelSnapshot.cs
  - docs/schema/initial.sql, rollback.sql, better-auth-1.7.5.json
  - scripts/generate-initial-schema.mjs, package.json, app/web/package.json
  - app/web/src/lib/auth.ts, auth-client.ts, app/web/src/app/api/auth/[...all]/route.ts, app/web/src/components/auth-placeholder.tsx, app/web/.env.example
  - playwright.config.ts, tests/schema/migration.spec.ts, tests/api/ef.spec.ts, tests/e2e/home.spec.ts
  - docs/DECISIONS.md, docs/HANDOFF.md
- Validation:
  - npm run lint: passed cleanly with zero errors.
  - npm run typecheck: passed cleanly across Next.js and root workspaces.
  - npm run build: production Next.js build succeeded in 2.4s.
  - dotnet build app/api --configuration Release: passed with 0 warnings, 0 errors.
  - dotnet ef database update --project app/api: succeeded on Supabase; applied 20260919042809_InitialSchema.
  - dotnet ef migrations list --project app/api: verified no pending migrations on Supabase.
  - npx playwright test: 17 passed across Chromium, API, and Schema suites in 29.3s.
- Known issues or risks:
  - Live GitHub sign-in requires GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET configured in the runtime environment.
  - Next.js web application requires DATABASE_URL and BETTER_AUTH_SECRET configured for live session persistence.
- Exact next step:
  - Create the GitHub OAuth application (or GitHub App), configure the credentials in app/web/.env.local, and test live sign-in flow and JWT verification against the ASP.NET Core API.

## Previous task: minimal web skeleton (2026-09-19)

- Branch: main, explicitly authorized. Existing connection-check handoff edits preserved.
- Added a homepage, login, signup, and empty public dashboard preview with shared
  navigation, responsive styling, page titles, and a keyboard skip link.
- GitHub sign-in and create/connect actions are visibly unavailable and disabled.
  No credential collection, fake sessions, API changes, data writes, or dependencies.
- Updated files: app/web/src/app/{page.tsx,layout.tsx,globals.css}; added
  login/page.tsx, signup/page.tsx, dashboard/page.tsx, and
  app/web/src/components/auth-placeholder.tsx. Updated tests/e2e/home.spec.ts,
  README.md, TESTING.md, ARCHITECTURE.md, DECISIONS.md, and this handoff.
- Recorded the user's approved Better Auth/GitHub OAuth, GitHub Apps, and project
  membership direction in ADR-008. Implementation is explicitly deferred.
- Validation: npm run lint and npm run typecheck passed. npm test passed all nine
  tests in 19.7 seconds, including web production and API builds. Initial build
  failed on a CSS UTF-8 BOM; removing the BOM resolved it. git diff --check passed.
  Reviewed desktop home and mobile login/dashboard screenshots under test-results/;
  no overflow or obscured controls. React review: server components, semantic links
  and headings, visible focus, no unnecessary hooks or client state.
- Unverified: real authentication, authorization, persistence, and GitHub actions
  remain intentionally unimplemented; no deployment was attempted.
- Limits: dashboard is public only because it has no real data; authentication and
  project authorization must be enforced before real product data is exposed.
- Exact next step: wait for the user's instruction to create tables, then implement
  Better Auth and GitHub integrations in the requested order. Deployment is deferred.
  No commits or pushes made for this UI task.

## Foundation history

- Task: establish the approved Next.js/.NET/Supabase foundation.
- Branch: `main`, explicitly requested by the user. No branch created, commits
  made, or pushes performed for this task.
- Web: existing Next.js 16.3.5 application moved to `app/web` with source and
  assets preserved byte-for-byte according to Git blob hashes.
- API: ASP.NET Core 10 in `app/api`, SDK 10.0.401, nullable checks and warnings
  as errors. `GET /health` returns `{ "status": "ok" }`; development exposes
  `/openapi/v1.json`.
- Database: Supabase PostgreSQL, with EF Core 10 and Npgsql initialized as the
  sole ORM/migration system. Drizzle was explicitly replaced with user approval.
- EF context has no entities or migrations. Startup and health checks never query
  or modify a database. No live Supabase database query or migration was executed.
- Supabase MCP is configured globally for project `hgcjtecsglksdbsmtcxt` and
  authenticated. `codex mcp login` succeeded; `codex mcp list` reports enabled/OAuth.
- Pending branch-permission edits in AGENTS.md and WORKFLOW.md were preserved.
  Ask permission before each new task branch; remain on the current branch when
  chosen, and retain that choice throughout follow-up work.

## Completed work and changed files

- Moved `src/`, `public/`, `next.config.ts`, `postcss.config.mjs`, and the web
  TypeScript configuration into `app/web`; added its package manifest and env
  example. Root package.json and package-lock.json now define a single npm workspace.
- Added `app/api/Program.cs`, `Data/SpecThreadDbContext.cs`, project file,
  generated NuGet lockfile, and placeholder-only environment example.
- Added `global.json` and generated `dotnet-tools.json` with dotnet-ef 10.0.12.
- Updated root TypeScript, ESLint, Git ignore, npm scripts, and Playwright config.
- Added HTTP health/OpenAPI/404 tests and EF initialization/missing-config tests
  under `tests/api/`; retained the existing Chromium homepage smoke test.
- Added `.github/workflows/ci.yml` using the documented local checks.
- Renamed `docs/PROJECTS.md` to `docs/PROJECT.md` to match existing references.
- Updated README, AGENTS.md, ARCHITECTURE.md, WORKFLOW.md, TESTING.md, and
  DECISIONS.md (ADR-006/007). Added DATABASE.md and refreshed this handoff.
- Optional duplicate Supabase skills installation skipped: the Supabase skill
  is already installed. No application dependency on the Supabase client SDK.

## Decisions and remaining boundaries

- Approved layout is singular `app/web` and `app/api`.
- Node.js 24/npm 11; existing web dependency versions retained. One npm lockfile.
- EF and OpenAPI packages are 10.0.12; Npgsql EF provider is 10.0.3. Versions
  were checked against NuGet; the generated lockfile pins transitive dependencies.
- New API dependencies provide OpenAPI, PostgreSQL EF access, and design-time
  migration tooling. No product models, authentication, or repository integrations.
- EF must be initialized before database execution. No automatic startup migration
  or database creation. Supabase-managed schemas remain outside application ownership.
- Docker Compose deferred because no current check needs a database.
- Authentication, API deployment provider, GitHub App/OAuth choice, first feature
  contract/schema, and team merge policy still need agreement.

## Verification

- `npm install`: passed; regenerated workspace lockfile.
- `npm ci`: passed; 368 packages installed, audit reported 0 vulnerabilities.
- `dotnet restore app/api --locked-mode`: passed.
- `dotnet tool restore`: passed, dotnet-ef 10.0.12 restored.
- `dotnet build app/api --configuration Release --no-restore`: passed,
  zero warnings and errors.
- `dotnet format app/api --verify-no-changes --no-restore`: passed.
- Initial `npm run lint` and `npm run typecheck`: passed after the move.
- Initial `npm test`: 4 passed (homepage and three HTTP API checks), including
  web production build and managed server startup.
- `dotnet ef dbcontext info --project app/api --configuration Release --no-build
  --json`: passed with dummy localhost port 1 credentials; Npgsql provider confirmed
  without opening a database connection.
- Final `npm run lint` and `npm run typecheck`: passed. Root `npx tsc --noEmit`
  also passed after the final test assertion edit.
- `npm test -- --list`: passed, six tests discovered across three files.
- Final `npm test`: six passed in 17.8 seconds, including production web and
  Release API builds. An initial missing-config assertion checked the Node error
  message; it was corrected to check EF CLI stdout and the expected nonzero exit.
- `git diff --check`: passed. Final diff and added files reviewed for scope,
  generated artifacts, credentials, and duplicate configuration.
- Moved source/assets verified against HEAD hashes. Generated .next, bin, obj,
  reports, and test results remain ignored. No real credentials added to the repo.
- Supabase automatic OAuth discovery initially failed with unsupported scopes.
  Explicit supported scopes succeeded after user browser authorization.
- A final-check attempt was blocked by approval-review usage limits. The user
  requested continuation and the retry was accepted.

## Limits and exact next step

Migrations, production API hosting, the
interactive `/mcp` panel, and the GitHub-hosted CI run have not been verified.
Existing Codex sessions may need reload to expose the newly added MCP tools.
The web build needs Google Fonts network access. npm reports the existing ESLint
9.39.5 as deprecated; upgrading unrelated framework tooling was left out of scope.

Review and commit the locally verified baseline on main, then run the
workflow on GitHub before teammates branch from it. The first feature should
agree on a requirement API contract and authorization model before schema work.
Suggested independent ownership: requirement API/persistence, requirement UI
against the agreed contract, GitHub integration investigation, and Playwright
acceptance scenarios. Ask the user about branching before starting any new task.

## Live connection check follow-up

- Branch: main, continuing the approved database setup. Application code unchanged.
- A temporary external C# probe initialized the existing EF context and attempted
  a read-only connection using app/api/.env.local, loaded explicitly for the probe.
  No credentials were printed. The normal API does not automatically load this file.
- The probe failed before authentication with SocketError NoData. DNS inspection
  found no IPv4 A record and one IPv6 AAAA record for the configured direct host.
  A TCP check to that IPv6 address on port 5432 returned NetworkUnreachable.
- No SELECT statement reached the database; no data or schema changes occurred.
- The user subsequently changed app/api/.env.local to the Session pooler. A retry
  reached that endpoint but failed TLS verification before authentication. A
  certificate diagnostic reported RemoteCertificateChainErrors / UntrustedRoot.
  The diagnostic rejected the untrusted certificate; verification was not bypassed.
- An earlier retry: Root Certificate was configured, but File.Exists returned false
  and Npgsql failed with DirectoryNotFoundException. No authentication or SQL
  execution occurred. Correct the certificate path to an existing local file.
- Previous retry: the certificate file exists, EF initialized, and the connection
  passed TLS verification with VerifyFull. PostgreSQL rejected authentication
  with SQLSTATE 28P01 (invalid_password). SELECT 1 did not execute.
- Latest retry succeeded: EF Core authenticated to Supabase through the session
  pooler with SSL Mode=VerifyFull and the configured CA certificate. SELECT 1
  returned 1. No data or schema changes were made and no credentials were printed.
- Next step: configure the same connection string in API user-secrets or its
  environment. The normal API does not load .env.local; only the temporary probe
  loaded it explicitly. Live credentials and connectivity are verified for the
  probe, not yet configured for normal API startup.
- Verification: DNS A/AAAA checks and IPv6 TCP diagnostic completed; git diff
  --check passed. Only this handoff was updated in the repository.
