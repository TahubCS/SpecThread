Architecture Decision Log

Record durable choices here. Add a new entry; do not rewrite history merely because a later decision supersedes an earlier one.

ADR-001: Use Next.js for the web application

Status: Accepted

Context: The earlier proposal used SvelteKit, but the initialized project and team direction use Next.js.

Decision: Use Next.js App Router with TypeScript for the web application.

Consequences: The team needs one agreed Next.js structure and must avoid duplicating API domain logic inside Next.js when ASP.NET Core owns the backend.

ADR-002: Use ASP.NET Core as the product API

Status: Accepted

Context: The project is intended to expose the team to a stack beyond a single full-stack JavaScript application.

Decision: Use an ASP.NET Core Web API for domain rules, authorization, persistence coordination, and external integrations.

Consequences: The web and API need an explicit contract. Running two applications adds setup cost, so boundaries must remain simple.

ADR-003: Start as a modular monolith

Status: Accepted

Context: SpecThread has several conceptual domains but no demonstrated need for independently deployed services.

Decision: Keep one API deployment with internal modules and one web deployment.

Consequences: Development and transactions remain simpler. Modules can be extracted later only if evidence justifies it.

ADR-004: Treat automated results as evidence, not proof

Status: Accepted

Context: Arbitrary requirements cannot be conclusively verified by AI or one browser test.

Decision: SpecThread aggregates evidence and evaluates configured checks, while an authorized human makes the final acceptance decision.

Consequences: UI language, statuses, and data models must distinguish linked evidence, passing checks, evidence completeness, and human acceptance.

ADR-005: Standardize automated behavior testing on Playwright Test

Status: Accepted

Context: The team requested Playwright configuration first and a shared testing approach for the project.

Decision: Use @playwright/test as the runner for all automated behavior tests. Keep a single root playwright.config.ts with tests under tests/. Start with Chromium and a smoke test for the existing homepage. Playwright builds and starts its own production web server on 127.0.0.1:3100 and does not reuse another process. Retain traces and screenshots on failure, and generate an HTML report. Use request fixtures for future HTTP API tests and browser-free tests for directly testable TypeScript logic.

Consequences: The only new direct dependency is a development dependency, @playwright/test. Developers must install its Chromium binary. Test runs require a production build; the existing next/font/google setup also requires access to Google Fonts during that build. Linting, type checking, and builds remain separate quality checks. Playwright cannot directly execute C# unit tests; API behavior will be tested over HTTP, and adding another runner requires a later recorded team decision. This decision does not choose API contracts, move the web app, or broaden the product's runtime-verification scope.

ADR-006: Separate applications in app/web and app/api

Status: Accepted

Context: The user explicitly approved retaining ASP.NET Core, moving Next.js into app/web, and targeting .NET 10 while working on main.

Decision: Preserve the existing Next.js app in app/web; add a minimal ASP.NET Core 10 API in app/api. Use npm workspaces with one root package-lock.json and root Playwright tooling. Use Node.js 24/npm 11 and pin the .NET SDK to 10.0.401 with patch roll-forward. The health-only API requires no database. Development OpenAPI is the inspectable API contract.

Consequences: Each application has its own runtime and build, with root convenience commands. Supersedes the initial root-web layout described in ADR-005. The user controls branch creation under the existing permission policy.

ADR-007: Supabase PostgreSQL with EF Core as the sole ORM and migration owner

Status: Accepted

Context: The user selected Supabase PostgreSQL and subsequently approved replacing the proposed TypeScript-only Drizzle ORM with EF Core for the C# backend.

Decision: Use EF Core 10 with Npgsql for data access and schema migrations. Initialize and verify the context before database execution. Use one local dotnet-ef tool manifest. Keep credentials in API user-secrets or environment variables. Do not automatically create databases or apply migrations during startup. Do not introduce Drizzle or a competing migration system.

Consequences: No application schema is invented in the foundation. The future persistence task must define authorization, schema exposure/RLS, and migration rollback before creating tables. Supabase-owned auth/storage schemas remain outside EF ownership. The initial health endpoint does not imply database readiness. The project-scoped Supabase MCP connection is developer tooling, not application database authentication. Optional duplicate Supabase skills are unnecessary because the Supabase skill is already installed.

ADR-008: Stage the UI before authentication and persistence

Status: Accepted

Context: The user approved Better Auth with GitHub OAuth, GitHub Apps for repository access, and owner/member project access, then explicitly limited the immediate task to a minimal UI skeleton on main.

Decision: Add home, login, signup, and a public dashboard preview first. No simulated sessions, credential collection, product tables, or deployment in this stage. Later implement Better Auth in Next.js with authentication-only database access and C# token validation; keep product data access in the API. Enforce project membership, allow members to create/edit requirements, and restrict project ownership changes to authorized owners. Review/approval permissions still require agreement before review endpoints exist.

Consequences: The planned authentication-only database access is an explicit exception to the earlier API-only database boundary. EF remains the migration owner, with Better Auth schema compatibility to be verified before implementation. Tables await the user's next instruction, followed by auth and GitHub work. Vercel is the chosen web host; deployment and the final API hosting plan remain deferred. Public dashboard access is only for this empty preview and must be replaced with enforced access before exposing product data.

ADR-009: Initial Application and Authentication Schema with EF Core and RLS

Status: Accepted

Context: Persistence foundation requires establishing the initial database schema supporting both Better Auth (core + JWT plugin) and SpecThread core domain models (projects, project members, requirements, and acceptance criteria). Tables hosted on Supabase must not be exposed unintentionally through public PostgREST / Supabase Data APIs.

Decision: Use EF Core 10 to manage the initial schema migration (20260919042809_InitialSchema). Map Better Auth tables (user, session, account, verification, jwks) with camelCase column naming matching Better Auth 1.7.5 expectations. Map SpecThread domain tables (projects, project_members, requirements, acceptance_criteria) with snake_case naming, check constraints, foreign keys, and optimistic concurrency versioning on requirements. Embed Row Level Security (RLS) enablement and permission revocation (REVOKE ALL FROM PUBLIC, anon, authenticated) directly into the migration transaction so that tables are securely isolated by default. Generate and preserve idempotent forward (docs/schema/initial.sql) and backward (docs/schema/rollback.sql) scripts, and verify them against disposable test containers.

Consequences: The database schema is strictly locked down from browser and anon/authenticated Supabase roles by default. Better Auth in Next.js and EF Core in ASP.NET Core access PostgreSQL via authenticated connection pooling. Database rollback is defined and automated in Playwright tests.

ADR-010: Web Deployment on Vercel and API Container Deployment on Render

Status: Accepted

Context: The SpecThread product architecture requires hosting platforms for both deployable units: the Next.js web application (in app/web) and the ASP.NET Core 10 Web API (in app/api).

Decision: Deploy the Next.js web application to Vercel with Root Directory set to app/web and workspace build support. Deploy the ASP.NET Core 10 Web API to Render as a Docker web service using a multi-stage Dockerfile based on official Microsoft .NET 10 SDK and ASP.NET runtime images. Supply a render.yaml blueprint configuring service parameters, the /health endpoint for liveness checks, and unprivileged execution (USER $APP_UID) on port 8080. Secrets and database connection strings are passed exclusively through platform environment variables and never committed.

Consequences: Clear separation of operational concerns. The Next.js frontend benefits from Vercel's global edge network and serverless rendering, while the C# API runs in a reproducible Linux container on Render with zero cloud vendor lock-in.

ADR-011: Supabase Root CA Baking in Docker Container for Linux Trust Store Integration

Status: Accepted

Context: Connecting Npgsql with `SSL Mode=VerifyFull` to Supabase's connection pooler requires trusting the custom `Supabase Root 2021 CA`. In local Windows development, this previously required an absolute file path in `Root Certificate=...`. On Render, absolute container paths in environment variables are fragile and leak deployment details into connection strings.

Decision: Place the public Supabase Root 2021 CA certificate in `app/api/certs/prod-ca-2021.crt`. During the Docker runtime stage, copy this certificate to `/usr/local/share/ca-certificates/supabase-root-2021.crt` and execute `/usr/sbin/update-ca-certificates`. This registers the certificate directly into Debian's system certificate bundle (`/etc/ssl/certs/ca-certificates.crt`).

Consequences: In production on Render, the Npgsql connection string simply requires `SSL Mode=VerifyFull;` without specifying `Root Certificate=...` or any file path. Both Linux OpenSSL and .NET `X509Chain` natively validate the Supabase TLS certificate chain. Local development can either continue using the existing local certificate path or rely on developer root stores.

ADR-012: Require explicit auth configuration and verified database TLS

Status: Accepted

Context: The user approved fixing hardcoded auth fallbacks, disabled certificate
verification, and broad trusted-origin wildcards on main.

Decision: Require an explicit random secret, PostgreSQL URL, and canonical app
origin. Trust only that origin. Enable the dashboard plugin only with an explicit
environment key. Verify TLS for remote PostgreSQL; optionally supply the CA PEM
through DATABASE_CA_CERT. Keep loopback plaintext for local testing. Isolate
Playwright auth settings from developer credentials. EF remains the migration owner.

Consequences: Deployment settings must be updated before releasing these fixes.
Previously committed dashboard credentials need rotation outside the repository.
JWT validation, project authorization, and GitHub Apps are separate unfinished work.
Correction to ADR-009: the generated forward/rollback scripts are not idempotent;
RLS is enabled with no allow policies, rather than user-specific access policies.

ADR-013: Prefer Vercel client IP headers for Better Auth

Status: Accepted

Context: The user approved implementing only recommendation 1 (proxy IP headers)
on main. Better Auth runs in Next.js on Vercel.

Decision: Resolve client IPs from x-vercel-forwarded-for first, then
x-forwarded-for. Keep Better Auth's IP parsing and rate-limit defaults; do not
trust unrelated proxy headers or add speculative trusted proxy ranges.

Consequences: The deployment must use trusted Vercel ingress and must reassess
header trust if its proxy topology changes. In-memory limits remain per instance;
shared storage, OAuth error pages, database joins, and app naming are deferred.

New decision template

ADR-014: Complete auth error handling, joins, and shared rate limits

Status: Accepted

Context: After recommendation 1, the user approved all nine implementation and
verification steps on main, including shared storage and the remaining insights.

Decision: Name the auth application SpecThread, use the existing PostgreSQL
adapter's joins, and use database-backed rate limiting through an EF-owned
AuthRateLimits migration. Keep production-only default enforcement and existing
thresholds. Provide a public /auth/error page with fixed messages, use both
global and per-flow error destinations, handle returned initiation errors, and
use same-origin browser auth requests. Retain exact trusted origins and TLS.

Consequences: Apply the migration before deploying the web app; database outages
affect rate-limited requests. No new production dependency or service is added.
Tests now require Docker even for the managed web server to exercise production
database rate limiting with isolated credentials. Real OAuth and proxy behavior
still require deployment verification. Rollback order is documented in DATABASE.md.


ADR-015: Validate Better Auth ES256 JWTs in the API through JWKS

Status: Accepted

Context: The API must identify callers before any product endpoint or project
membership check can exist. Better Auth's JWT plugin defaults to EdDSA (Ed25519),
which ASP.NET Core's JwtBearer and IdentityModel cannot validate without an
additional cryptography dependency. Better Auth publishes a bare JWKS without an
OpenID discovery document.

Decision: Configure the Better Auth JWT plugin with ES256. The API uses
Microsoft.AspNetCore.Authentication.JwtBearer and fetches public keys over HTTP from
{Auth:Issuer}/api/auth/jwks through IdentityModel's cached ConfigurationManager.
Auth:Issuer (environment Auth__Issuer) is the web app's exact origin: HTTPS, or HTTP
on loopback. Tokens must be ES256, signed by a published key, unexpired (30-second
skew), and have iss and aud equal to that origin. The sub claim is the Better Auth
user id. All endpoints require an authenticated user with a subject unless marked
AllowAnonymous; /health and development OpenAPI are anonymous. Unknown routes
return 401 to anonymous callers and 404 to authenticated callers. GET /me returns
{ "userId": sub } as the smallest verifiable authenticated endpoint.

Consequences: One new direct API package, from the ASP.NET Core release train.
The API depends on the web app's JWKS endpoint for key refreshes, not the jwks
table format. A missing or invalid Auth:Issuer keeps the API and /health running
but fails requests that present a token with an explicit configuration error.
Existing EdDSA keys must be expired once after deploying the web change, or
Better Auth keeps signing with them (DEPLOYMENT.md). Project membership, role
rules, and callers sending tokens from the web app remain separate work.

ADR-016: Email/password and Google sign-in with account linking

Status: Accepted

Context: The team decided SpecThread accounts should not depend on GitHub alone.
Users need traditional sign-in and Google sign-in, and must be able to connect
GitHub to an existing account. (ADR-015 is used by the separate API JWT
validation change.)

Decision: Enable Better Auth 1.7.5 email/password sign-in with required email
verification before sign-in, a 12-character minimum password, verification links
that sign the user in, single-use reset links, and session revocation on reset.
Keep GitHub sign-in and add Google; each social provider is enabled only when both
its client ID and secret are set. Signed-in users link or unlink Google and GitHub
from /account. Unlinking must leave at least one usable method: email/password or
a provider enabled in this deployment. The account page and a server-side
account delete hook, scoped to /unlink-account, both enforce this; Better Auth
alone only refuses to remove the last linked account. Unlinking requires a
recent sign-in. Implicit linking by matching email keeps Better Auth's
default: the provider must verify the email and the local email must be verified;
no provider is trusted to bypass this. Explicit linking allows a provider email
that differs from the account email (allowDifferentEmails), because the user is
already signed in and completes the provider's OAuth. Duplicate sign-ups and reset
requests answer identically, so they do not reveal which emails have accounts.

Email is sent through Resend's HTTP API with fetch; no new package. RESEND_API_KEY
and EMAIL_FROM are required unless EMAIL_DELIVERY=log, which prints messages
(including one-time links) to the server console and is accepted only for a
loopback BETTER_AUTH_URL, for local development and tests.

Consequences: No database migration; the existing account, user, and verification
tables already hold credentials, verification state, and links. Deployments need
Resend and Google configuration before shipping (DEPLOYMENT.md). Email delivery
failures block sign-up verification and resets until fixed. The team GitHub App is
private, so non-owners cannot use it for sign-in or linking until it is made public
or replaced with an OAuth App. Two-factor authentication, email changes, and
account deletion remain out of scope.

ADR-017: Validate auth inputs early and encrypt newly stored OAuth tokens

Status: Accepted

Context: The user requested a skill-guided auth configuration improvement on
auth/optimize after the earlier configuration work was merged.

Decision: Parse configured CA PEM certificates before constructing the pool;
trim GitHub credentials and require a complete pair when enabled; use Better
Auth 1.7.5's built-in account.encryptOAuthTokens for OAuth writes. Keep the
existing EF schema, secret, exact origins, joins, and shared rate-limit storage.

Consequences: No new dependency, environment variable, or migration. Bad local
configuration now fails early without exposing values. Encryption does not
backfill historical plaintext tokens. Deployment must retain the encryption
secret and option; see DEPLOYMENT.md for compatibility and rollback limitations.

ADR-018: Group informational routes and show personal and team projects together

Status: Accepted

Context: The frontend scaffold exposed separate Dashboard, Teams, and Projects
areas. The user clarified that a person can have personal projects as well as
projects owned by a team, questioned a standalone Search page, and chose an
About hub for the informational pages.

Decision: Keep `/dashboard` as the overview, `/teams` for team navigation, and
`/projects` for every project the user can access, including personal and
team-owned projects. Keep `/teams/[teamId]/projects` as the team-specific subset.
Remove the standalone `/search` route; search can be added within lists when
needed. Use `/about` as a hub with `/about/how-it-works`, `/about/privacy`, and
`/about/terms` as directly linkable pages.

Consequences: The frontend routes remain placeholders until product data and
authorization are implemented. Team membership, personal-to-team transfers,
review permissions, and the supporting schema/API contract need separate work.
No new database field or backend behavior is implied by the scaffold alone.

ADR-019: Navigate the route scaffold and redirect existing sessions

Status: Accepted

Context: The frontend scaffold had valid URLs but few links between pages. The
user requested navigation through all reserved pages without a visual redesign,
and a dashboard redirect when an existing user visits login or signup.

Decision: Keep one catalog of reserved frontend routes for parent, child, and
related placeholder links. Use clearly labeled example IDs where no project
data exists. Keep the dashboard public while it is an empty preview. On login
and signup, validate the Better Auth session on the server and redirect an
already authenticated user to `/dashboard`; successful GitHub OAuth already
uses `/dashboard` as its callback URL. Show login and signup links in the main
navigation only when there is no active client session.

Consequences: Placeholder links demonstrate the intended journey but do not
assert that example entities exist. The Better Auth session, rather than a raw
browser token or cookie presence, determines the server redirect. Product data
and authorization still require separate implementation before protected pages
are exposed.

ADR-020: Share a product shell and show a labeled dashboard preview

Status: Accepted

Context: The user selected a compact dashboard design with a persistent sidebar,
grouped requirement rows, and an inline evidence path. Product data and membership
authorization are not yet available, while the route scaffold remains public.

Decision: Use one persistent client shell in the Next.js root layout for product
routes, retaining the existing public header for public pages. The dashboard shows
illustrative requirement and evidence rows with a visible preview label. Its links
to entity pages use clearly labeled example routes. Keep login and signup session
redirects unchanged. Use a single line-icon package for interface icons and a
small generated image asset for the thread-inspired brand mark.

Consequences: Route transitions retain the sidebar and only the central page
content changes. The preview does not represent account data or claim that
repository evidence has been collected. Replace sample rows and example team links
when authorized project APIs are available, and protect product routes before
showing private data. This supersedes the empty-preview state in ADR-019.

ADR-021: Separate workspace and settings sidebars joined by a profile menu

Status: Accepted

Context: The user adopted Linear as a design reference. Settings shared the product
sidebar, and informational, onboarding, and account pages still used the public top
navbar. The user asked for work-related pages and everything else to use separate
sidebars, with a profile menu linking them and no navbar outside landing and sign-in.

Decision: Choose the frame from the pathname. `/`, `/login`, `/signup`,
`/forgot-password`, `/reset-password`, and `/auth/error` keep the public header.
`/settings`, `/account`, `/help`, `/about`, `/welcome`, `/onboarding`, and `/invites`
use a settings sidebar grouped as Personal, Security & data, Getting started, and
Help & about. Its top link returns signed-in users to the workspace and signed-out
visitors to the landing page. All other routes, including unknown routes, use the workspace sidebar.
A profile menu at the top of the workspace sidebar offers Settings, Account, and Log
out, or Settings, Log in, and Sign up when signed out. The account page moves to
`/settings/account`; `/account` redirects there. This supersedes ADR-020's statement
that public pages retain the existing header.

Consequences: New routes use the workspace sidebar unless deliberately listed as
public or settings routes. Linear is a reference, not a specification, so visual
details can change without a new decision. Workspace switching and member
management remain unimplemented.

ADR-022: Landing sections replace the About pages; policy pages stay public

Status: Accepted

Context: With ADR-021, the About and How it works links on the landing page opened
pages inside the settings sidebar, so visitors who had not signed in were taken into
the application shell. The user treated this as a security concern and supplied a new
landing page design with animated product previews.

Decision: The landing page uses the supplied design, rendering its own header and
footer, and adds About and How it works as sections below the hero. `/about` and
`/about/how-it-works` redirect to `/#about` and `/#how`. Privacy and Terms move to
public pages at `/privacy` and `/terms` that show only the minimal public header;
`/about/privacy` and `/about/terms` redirect there. The settings sidebar no longer
lists About, How it works, Privacy, or Terms, and Help moves into its Getting started
group. Landing animations pause on request and show their finished state when the
visitor prefers reduced motion. On narrow screens the page stacks and the wide
product previews scroll inside their own containers. This supersedes ADR-018's About
hub and the About entries in ADR-021.

Consequences: Visitors can explore everything public without entering the app
shell. Application routes such as `/dashboard` and `/settings` remain reachable by
URL until route protection is implemented; this decision does not add access
control. Policy text is still a placeholder.

ADR-023: Deny-by-default page access through a Next.js proxy

Status: Accepted

Context: Every application page, including the dashboard preview, settings, and
invitations, rendered for visitors without a session. The user treated this as a
security issue and chose to require sign-in everywhere except the landing, sign-in,
and policy pages.

Decision: `app/web/src/proxy.ts` validates the Better Auth session with
`auth.api.getSession` for every page request except `/`, `/login`, `/signup`,
`/forgot-password`, `/reset-password`, `/auth/error`, `/privacy`, and `/terms`, which
`isPublicPath` in `lib/app-navigation.ts` lists once. The matcher skips `/api/*`,
Next.js internals, and the public image files. Without a valid session the visitor is
redirected to `/login?next=<requested path and query>`; `safeNextPath` accepts only
same-site paths other than login and signup, defaulting to `/dashboard`, and every
sign-in method returns there. Session lookup errors propagate so a failed lookup never
renders a page. Pages that load data keep their own session checks. This supersedes
the public dashboard preview in ADR-019 and ADR-020, and ADR-021's signed-out "Back to
home" link in the settings sidebar, which only signed-in users now reach.

Consequences: New pages are protected unless deliberately added to the public list.
Each protected page request performs one session lookup. API authorization (project
and team membership) remains separate work in the C# API.

ADR-024: Projects and requirements API with member authorization

Status: Accepted

Context: Frontend developers need to read and change product data. The API exposed
only /health and /me, although EF Core already mapped projects, project_members,
requirements, and acceptance_criteria. The user chose the scope (projects,
requirements, acceptance criteria) and the authorization model below.

Decision: The API exposes /projects (list, create, get, rename, archive),
/projects/{id}/requirements (list, create), and /requirements/{id} (get, replace,
archive); docs/API.md is the contract summary and the Development OpenAPI document
is authoritative. Creating a project adds the creator as owner and member in one
transaction. Any member reads and edits the project's requirements; only the owner
renames or archives the project. Non-members receive 404, not 403, so the API does not
reveal that a project exists. A token whose subject has no user row cannot create
projects (403). Writes to archived projects or requirements return 409; archiving is
idempotent and keeps the first timestamp. Requirement updates send the whole
acceptance-criteria list and the loaded version; criteria are replaced in one
transaction with positions taken from list order, the version increments, and a stale
version returns 409. Text is trimmed. Limits: project names and requirement titles
1-200 characters, descriptions up to 10,000, up to 50 criteria of 1-2,000 characters.
Failures return RFC 9457 problem details; validation errors list fields. Next.js server
code calls the API through `apiFetch` in app/web/src/lib/api.ts, which exchanges the
session for a Better Auth JWT and reads the API origin from server-only
SPECTHREAD_API_URL; browsers do not call the API directly, so no CORS is configured.

Consequences: No schema change or migration was needed. Member management is
covered by ADR-025. Invitations, ownership transfer, teams, unarchiving, and audit
events are not yet implemented. Each
API call from Next.js performs a token exchange. Criteria IDs change on every update,
so later evidence links must not reference criterion IDs without revisiting this.

ADR-025: Owners add existing accounts to projects by email

Status: Accepted

Context: ADR-024 enforced project membership, but members could only be added in
the database. The user chose immediate adds of existing accounts instead of
invitations. Only the owner manages members, any member may leave, and the owner
cannot be removed.

Decision: GET /projects/{id}/members lists members to any member. It returns name,
email, join time, and isOwner, with the owner first. POST /projects/{id}/members
takes `{ email }` (owner only). The address is trimmed, at most 254 characters, and
matched without regard to case. It must belong to an account with a verified
address, so registering someone else's address without verifying it grants
nothing. An unknown or unverified address returns 400 on `email`. A duplicate
returns 409, including when concurrent adds hit the primary key.
DELETE /projects/{id}/members/{userId} returns 204. It is allowed for the owner, or
for a member removing themselves. Anyone else gets 403. Removing the owner returns
409, and so does a change to an archived project. Non-members get 404, as in ADR-024.

Consequences: Owners can tell whether an email has a verified SpecThread account.
This trade-off is accepted because only an authenticated project owner can ask.
Members see each other's email addresses. Requirements created by a removed member
keep their created_by. Invitations for people without accounts (the /invites
scaffold), ownership transfer, and rate limiting of member lookups remain future
work. No schema change was needed.

ADR-026: Product pages read through server components and write through server actions

Status: Accepted

Context: The projects list and create-project pages are the first pages that use the
API. ADR-024 requires that browsers never call the API directly. ADR-018 described
/projects as covering personal and team-owned projects, but the API has no teams.

Decision: A page loads its data in an async server component with `apiFetch` and
validates the response shape before rendering (app/web/src/lib/projects.ts). A failed
load throws, so the shared error page offers a retry; a route `loading.tsx` covers the
wait. Forms post to a server action and use React's `useActionState`. The action
validates input with the same limits as the API, shows the API's 400 field message
next to the field, and shows one general message for any other failure, which is
logged on the server. No form or validation library is added. Creating a project
makes a personal project owned by the caller; the form has no team choice until the
API supports teams.

Consequences: Product pages render on every request and need the API to be reachable.
Session expiry during a form submit shows the general failure message, not a sign-in
prompt. Browser tests need a real API, so the test web server starts one (docs/TESTING.md).

ADR-027: Black-and-white visual system for the signed-in app

Status: Accepted

Context: The signed-in pages used dozens of one-off grays, mixed corner shapes, gray
primary buttons, and uppercase labels above headings. The user rejected the gray and
lavender look, compared rendered alternatives, and chose near-black with white as the
accent, with a shell modeled on the Linear screenshots they supplied.

Decision: `.app-shell` in app/web/src/app/app-shell.css defines the colors, lines, and
text levels for every signed-in page, and rules there use those variables instead of
literal colors. The sidebar sits on the page background and the content is an inset
panel with a border and rounded corners. White marks the one primary action on a
page. Color is reserved for status: amber for "needs review", red for "missing
evidence" and destructive actions, green for "active". Each status color appears next
to a text label. View switches and project tabs are pills. Requirement IDs use Geist
Mono. One `.row-list` style serves project, requirement, and member lists. The
dashboard shows each sample requirement's evidence as a progress ring with a count,
and as a checklist when the row is opened; the row of connected circles is removed.
The uppercase label above page headings is removed from signed-in pages.

The landing, sign-in, password, sign-in error, and policy pages use the same black,
white, and neutral grays: the lavender values in landing.css, public-pages.css, and
the unscoped `.scaffold-*` rules were replaced, and the lavender brand image is shown
in white through a CSS filter.

Consequences: New signed-in UI should use the variables. The public pages still use
literal colors and the landing page's own variables, not the `.app-shell` variables.
The browser icon keeps the original lavender mark. This replaces the visual reference
in ADR-020 and the palette in ADR-022.

ADR-028: A project is a framed workspace with tabs

Status: Accepted

Context: The project pages were unconnected placeholders that accepted any ID. The
user asked for a project working environment that is easy to extend.

Decision: app/web/src/app/projects/[projectId]/layout.tsx loads the project once per
request and frames every page under it with a breadcrumb and the tabs Overview,
Requirements, Members, and Settings. A project the user does not belong to, an unknown
ID, or an ID that is not a UUID shows the not-found page for every sub-route, matching
the API's 404 for non-members (ADR-024). IDs are checked for UUID shape before they
are placed in an API path. Loaders in app/web/src/lib/project-data.ts are cached per
request so the layout and its pages share calls. Overview shows the five most recently
changed requirements and a details panel. Requirements and Members are read-only
lists. Settings lets the owner rename the project and archive it after an explicit
confirmation, because the API has no unarchive. Creating a project now opens it
(this changes ADR-026, which returned to the list). The remaining planned project
pages render inside the same frame. Links to example projects are removed from the
sidebar, the dashboard, and the planned-page navigation, because they would now show
not-found.

Consequences: A new project section is a new folder under `[projectId]` plus one tab
entry. The not-found page for a project is sent with HTTP 200 because the loading
state has already started the response. Creating and editing requirements, managing
members, and the evidence views are still to be built. The owner's name comes from
the members list. The Activity panel shows only the creation event, the one event
the API can supply.

ADR-029: Failed API calls keep the user's place, and tests can make the API fail

Status: Accepted

Context: The project pages had no tests for a failing API, and testing them showed two
gaps: "Try again" on the error page re-rendered the failed result without asking the
API again, and a form submitted after the session ended showed the error page
instead of asking the user to sign in.

Decision: A failed page load shows the shared error page, and "Try again" uses Next's
`retry()` so the data is fetched again. A failing project section shows that error
inside the project frame; a failing project load shows it without the frame. A failed
create, rename, or archive keeps what the user typed and shows one message next to
the form: the API's field message for 400, an owner-only message for 403, an archived
message for 409 on rename, and a general message otherwise. When the error page
appears and the browser has no session, the user is sent to `/login` with `next` set
to the page they were on (this changes ADR-026). Browser tests reach the API through
scripts/test-api-proxy.mjs on port 5107, which forwards requests unless a test has
registered a fault for its own user: a status and body, a dropped connection, or a
delay. The proxy runs only in the test harness.

Consequences: The sign-in redirect needs one extra session request whenever an error
page is shown. Text typed into a form is lost when the session has ended. The proxy
reads the user ID from the token without verifying it, which is acceptable because
it only selects test faults and the API still verifies every token.

ADR-030: Requirements are created, edited, and archived inside the project's Requirements tab

Status: Accepted

Context: The API already supported requirements with ordered acceptance criteria and
versioned updates (ADR-024), but no page used it.

Decision: The Requirements tab lists a project's requirements and links to a create
page, a detail page, and an edit page, all inside the project frame (ADR-028). One
form component serves create and edit. Criteria are a list of text fields that can
be added and removed; a blank criterion is an error, not silently dropped, so the
position in an API field message always matches the field on screen. The edit form
sends the version it was loaded with. When the API refuses a save with 409, the
action reads the requirement again to say whether it was archived, changed by someone
else, or belongs to an archived project. Archiving a requirement asks for
confirmation because the API has no unarchive. Archived requirements and
requirements of archived projects stay readable and show no edit or archive
controls. A requirement opened under a different project's address shows not-found.
The author's name comes from the project's member list; someone no longer a member
is shown as "a former member".

Consequences: Criteria cannot be reordered except by removing and re-adding them.
After a conflict the user must reload and re-enter their change; there is no merge.
Every save gives the criteria new IDs (ADR-024). The planned evidence, review, and
history pages under a requirement are still previews and are not linked from the
detail page.

ADR-031: Projects have no members page; membership will belong to teams

Status: Accepted

Context: The user decided that every project must belong to a team, that only a team
configures a project, and that membership is managed on the team. Onboarding that
creates a user's first team is being built on a separate branch.

Decision: The project Members tab and the `/projects/{id}/members` and
`/projects/{id}/settings/members` pages are removed, along with the member count in
the project's details panel. This changes ADR-028. The API's member endpoints
(ADR-025) are unchanged and are still read for the owner's and authors' names.

Consequences: Until teams exist in the API, project membership can only be changed
through the API directly. Project ownership, the project list, and the owner-only
rules will need to change when projects move under teams.

ADR-032: A project connects one GitHub repository through the GitHub App

Status: Accepted

Context: The user chose a real GitHub connection for evidence. The GitHub App
`specthread` is also the app used for GitHub sign-in, so a signed-in GitHub user has
a token issued by it. An installation ID alone must not be trusted: anyone can guess
one.

Decision: A project has at most one repository, stored in `project_repositories`
(migration ProjectRepositories). The owner connects it in project Settings. The web
app reads the owner's GitHub token from their linked GitHub account through Better
Auth and sends it to the API for that one request; it is never stored by the API,
logged, or sent to the browser. The API lists repositories with
`GET /user/installations` and `GET /user/installations/{id}/repositories`, so GitHub
decides what the user can reach. Before saving, the API finds the chosen repository
in that installation with the user's token and confirms it can act as the app there
by creating an installation token. All GitHub calls go through `IGitHubClient`
(app/api/GitHub). New settings: `GitHub:AppId`, `GitHub:PrivateKey` (PEM; literal
`\n` accepted), `GitHub:AppSlug`, and optional `GitHub:ApiBaseUrl` for tests. No
Setup URL or webhook is used. Members read the connection; only the owner connects
or disconnects; archived projects cannot change it. GitHub being unreachable is 502,
missing or rejected app credentials 503, and a token or repository GitHub does not
accept 400 on the field.

Consequences: A user who signed up by email must link GitHub before connecting. The
web app's GitHub client ID must be this GitHub App's. The repository's name is a
snapshot from connection time and is not updated if it is renamed. Listing stops at
500 repositories. The API must be deployed with the migration applied before the web
app that calls it: against an older API, project pages show not-found. Linking
issues and pull requests, checks, releases, and webhooks are later slices.

ADR-033: Issues and pull requests are linked to a requirement as stored GitHub snapshots

Status: Accepted

Context: With a repository connected (ADR-032), a requirement needs the issues and
pull requests that implement it. The product must keep inspectable evidence
(ADR-004), and no webhook exists yet.

Decision: `requirement_evidence` (migration RequirementEvidence) stores one row per
linked issue or pull request: its kind, number, title, state (open, closed, or
merged), author, GitHub link, GitHub's created, updated, and closed times, the
repository it came from, who linked it, and when it was last read. Any project member
links an item by number, `#number`, or its github.com address, which must be in the
project's connected repository. The API reads the item from GitHub as the app
(installation token) before saving, so only items that exist can be linked. A
requirement holds at most 50 links and each item once. "Refresh" reads every linked
item of the connected repository again and saves only if all reads succeed; an item
GitHub no longer has keeps its last snapshot. Unlinking removes the row only.
Archived requirements and projects are read-only. Without a connected repository,
existing links stay readable but cannot change. A missing item is 400 on
`reference`; a duplicate, the limit, no repository, or an uninstalled app is 409 with
the reason in `detail`.

Consequences: Evidence is as fresh as the last refresh; nothing updates on its own
until webhooks exist. An installation token is created for every GitHub read and is
not cached. Commits, check results, and releases are not shown yet. Reconnecting a
different repository leaves earlier links as unrefreshable snapshots.

ADR-034: Commits are evidence, linked directly and shown inside pull requests

Status: Accepted

Context: The user's purpose for the product is that the changes made in commits
count as evidence, not only issues and pull requests.

Decision: A commit of the connected repository can be linked to a requirement by its
SHA (7 to 40 hex digits) or its github.com address, including the address of a commit
opened inside a pull request. The API reads it from GitHub as the app and stores the
full SHA, the first line of the message (at most 300 characters), the author
(GitHub account, otherwise the name written in the commit), the commit date, and the
lines added, lines removed, and files changed. A linked pull request now also stores
its totals (commits, lines added and removed, files changed), its latest commit's
SHA, and its first 100 commits as a JSON array, shown on demand. Migration
EvidenceCommits changes `requirement_evidence`: `number` and `state` become optional,
and `sha`, `additions`, `deletions`, `changed_files`, `commit_count`, and `commits`
are added. A check constraint requires a commit to have a SHA and no number or state,
and an issue or pull request to have a number and a state. A commit can be linked
once per requirement. Text made only of digits is read as an issue number. Refresh
reads issues and pull requests again but not commits, because a commit does not
change.

Consequences: A commit whose SHA is all digits and seven or more long must be linked
by its address. Files changed in a commit is the number GitHub lists, which it caps
for very large commits. Rolling the migration back deletes commit links. Check
results and releases are still to come; the pull request's latest commit SHA is
stored so check results can be read for it later.

ADR-035: Check results are stored with the commit or pull request they ran on

Status: Accepted

Context: A reviewer must be able to see which automated checks ran and what they
reported (docs/PROJECT.md). Linked pull requests already store their latest commit's
SHA (ADR-034).

Decision: When a pull request or commit is linked or refreshed, the API reads that
commit's check runs and its older-style commit statuses from GitHub as the app and
stores them on the evidence row (`checks`, `check_count`, `checks_read_at`; migration
EvidenceChecks). Each is normalized to a name, a result, a link, a completion time,
and whether it is a check run or a status. The result is one of: passed (success),
failed (failure, timed out, action required, error), running (not completed, pending),
skipped, cancelled, or neutral (anything else). "Passed" means only that a recorded
check reported success. The first 100 are stored, sorted by name, with GitHub's
total. A link is kept only when it points at github.com, so a status from an outside
CI service is listed without one. If GitHub will not let the app read either kind
(403 or 404), `checks` is stored as null and the item is still linked or refreshed;
if it can read one kind, that kind is shown. Any other GitHub failure stops the link
or the refresh as before. Refresh now also visits commits, for their checks only. The
GitHub client keeps an installation token for the length of one API request.

Consequences: A refresh makes more GitHub calls (five for a pull request, two for a
commit) and gets slower as links grow. Results are a snapshot: a running check stays
"running" until someone refreshes. A missing Checks or Commit statuses permission
shows as "Check results could not be read", not as an error. Reusing the token within
a request is not covered by a test.

ADR-036: Every evidence link records its source, and AI may only suggest

Status: Accepted

Context: The user plans AI summaries and recommendations. The product boundary
(AGENTS.md) is that AI may suggest relationships or summaries while people inspect
the evidence and make the acceptance decision.

Decision: `requirement_evidence.source` is `manual` or `suggested` (default `manual`;
migration EvidenceChecks). `linked_by` is always a person: for a suggested link, the
person who confirmed it. The link endpoint ignores any `source` a caller sends and
writes `manual`; only a future "confirm a suggestion" endpoint will write
`suggested`. The requirement page names who confirmed a suggested link. Rules for
the AI work that follows: suggestions are kept in their own store and enter
`requirement_evidence` only when a project member confirms them; AI never records a
review decision; every core flow works with AI unavailable or switched off; and AI
output shown to users is labeled as a suggestion and tied to the evidence it refers to.

Consequences: No AI code, provider, or suggestions table exists yet, and nothing can
create a `suggested` row except a direct database write. Rolling the migration back
loses the marker. Which model or provider to use is undecided.

ADR-NNN: Title

Status: Proposed, Accepted, Superseded, or Rejected

Context:

Decision:

Consequences:
