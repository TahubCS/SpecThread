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
so later evidence links must not reference criterion IDs without revisiting this
(ADR-051 later keeps each saved criteria list as a numbered version, still not by ID).

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
confirmation because the API has no unarchive (ADR-050 later adds restore). Archived requirements and
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
or disconnects (ADR-041 later changes this to the team's Owner or an Admin); archived
projects cannot change it. GitHub being unreachable is 502,
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

ADR-037: Releases are evidence, and GitHub's history says which linked changes they contain

Status: Accepted

Context: The remaining evidence question in docs/PROJECT.md is whether a change was
associated with a release. The user chose to have SpecThread ask GitHub which linked
changes a release contains, so the answer does not rest on someone asserting it.

Decision: A published release of the connected repository can be linked to a
requirement by its tag or its github.com address. The API reads the release as the
app, resolves its tag to a commit, and stores the tag, name, pre-release flag,
author, publish date, link, and that commit's SHA. For every linked commit and merged
pull request it asks GitHub's compare endpoint whether that change is an ancestor of
the release's commit and stores the answers on the release row (`contains`, a map of
evidence ID to true or false). A commit is compared by its SHA. A merged pull request
is compared by its merge commit, now stored as `merge_sha`, because after a squash or
rebase merge the commit on its branch is not in the target branch's history. An
unmerged pull request is not compared. A commit GitHub no longer has is not included.
The comparison runs when a release is linked, when a commit or pull request is linked
while releases exist, and for everything on refresh. Migration EvidenceReleases adds
`tag`, `prerelease`, `merge_sha`, and `contains`, allows `kind = 'release'`, requires
a release to have a tag and no number or state, and allows each tag once per
requirement. A reference is read in this order: a number, a commit SHA, a github.com
link to an issue, pull request, commit, or release, and otherwise any text without
spaces up to 100 characters as a release tag. Releases have no check results.

Consequences: "Included" means the commit is in the history of the release's tag; a
change reverted before the release still counts. A tag made only of digits, or one
that looks like a SHA, must be linked by its address. Mistyped text is now answered
with "GitHub has no release tagged ..." where it used to be rejected as a format
error. Draft releases cannot be linked. One release costs two GitHub calls plus one
per linked commit and merged pull request, on link and on every refresh. Deployments
are not covered: the app lacks that permission. How a tag is resolved to a commit and
the compare statuses follow GitHub's documentation and have not been confirmed
against the real GitHub. Rolling the migration back deletes release links.

ADR-038: A person other than the author records the decision on a requirement

Status: Accepted

Context: docs/PROJECT.md asks for "recording a human review decision and note" and
for an answer to "Who accepted or rejected the available evidence, and when?" It is
also the human checkpoint that later AI assistance depends on (ADR-036). The user
chose that any project member except the requirement's author may decide, and that
a decision stays and is shown as outdated when the requirement changes afterwards.

Decision: A decision is `accepted`, `rejected`, or `more_evidence`, with a note of
up to 2,000 characters that is required unless the decision accepts. Any project
member may record one except the person who created the requirement, who gets 403
with the reason. An archived requirement or project takes none (409). The request
carries the requirement `version` the reviewer saw, and a different current version
is refused with 409, so nobody decides on text they have not read (the pattern of
ADR-030). Each decision is a new row in `requirement_reviews` (migration
RequirementReviews); rows are never changed or deleted through the API, and the
newest is the requirement's current status. A row stores the version reviewed and a
snapshot of the evidence links at that moment: each link's ID, kind, label (`#9`,
short SHA, or tag), title, and state. "Outdated" is computed, not stored: the
current version differs from the reviewed one, or the set of current evidence link
IDs differs from the snapshot. Refreshing evidence from GitHub keeps the IDs and so
does not make a decision outdated. The requirement list carries each requirement's
latest decision with `outdated`; the requirement itself does not, because its page
reads the full list of decisions. On screen "Accepted" means a person approved the
requirement; nothing says verified or proven.

Consequences: A project whose team has one member cannot record any decision; a
second person joins the team by invitation (ADR-040, ADR-041). The author rule
looks only at who created the requirement, not at who edited it last. A decision
can be made with no evidence linked. Nothing is locked after acceptance: an edit or
a changed link marks the decision outdated and waits for a new one. There is no
assignment of reviewers, no notification, and no evidence policy; "My reviews" and
Inbox stay previews (ADR-053 later adds a fixed Evidence complete rule). The snapshot does not record check results or release
contents, and a refresh that changes a link's state does not mark the decision
outdated. ADR-051 later records the criteria version each decision was made against and
asks for confirmation before accepted criteria change. The list endpoint reads every decision of the listed requirements to find
the latest. Rolling the migration back deletes every recorded decision.

ADR-039: Teams foundation with member-only reads and one owner

Status: Accepted

Context: The user requested complete Teams implementation in successive vertical
slices on `feature/teams`, coordinating with Claude Code's `feature/visual-polish`.
The user selected compact team rows, a dedicated creation page, team-section tabs,
real sidebar links now, and Owner/Admin/Member roles with one owner.

Decision: The first slice exposes authenticated GET/POST `/teams` and GET
`/teams/{id}`. Creating a team saves the creator's membership in the same transaction.
Only a member can find or read a team; other callers get 404. The team has one
`owner_user_id`, and other membership roles are `admin` and `member`; the API derives
the owner's role from that single field. Names and descriptions reuse the existing
project/requirement text limits. EF's Teams migration adds `teams` and `team_members`,
with RLS enabled and browser-role grants revoked. No live migration or startup
migration is performed. Web pages use server-only API calls with Better Auth JWTs.
The sidebar reads a same-origin, session-checked endpoint. The layout and section
pages both verify membership so later navigation does not depend on a cached layout.

Consequences: Team creation, list/search, overview, and sidebar navigation use real
data. `/teams/new` opens the created team, whose tabs use the existing section URLs.
Admins are represented but cannot yet be appointed through an endpoint. Member
management, invitations, settings/activity, ownership transfer, and team project
access require user choices in their respective slices. No team membership changes
existing project permissions. Team-specific styling uses existing app tokens and a
CSS module; the shared sidebar patch changes its data rather than the visual system.

ADR-040: Team navigation, required first-team onboarding, and team-owned projects

Status: Accepted

Context: The user clarified the desired navigation using screenshots, paused changes,
chose the detailed behavior, and explicitly approved resuming the revised Teams plan.
This supersedes ADR-018's personal-project model and ADR-039's six-section Team Home.

Decision: Your teams has independently expandable groups, with Home and Projects
links and account-saved expansion preferences. Favorites are personal and sort first
within Your teams. Each team's menu contains Favorite/Unfavorite, Team settings,
Copy URL, Open archive, and Leave team. The archive contains that team's archived
projects. Owners/Admins restore from an archive row after confirmation naming the
project and team; Members see the archive without restore controls. Team Home has Overview and Members tabs; Overview shows name/description
in the main area and members/quick links on the right. Documents is separate future
work. The combined Projects view remains and groups accessible projects by team.

After the first verified sign-in, /onboarding requires a team name and optional
description in a focused page without workspace navigation. Successful creation
atomically saves the team, its Owner membership, and onboarding completion, then
opens Team Home. Completion lives in user_onboarding, not cookies or local storage.
The page proxy redirects incomplete accounts from protected pages, and the API
rejects project creation until completion. Duplicate initial submissions cannot
create two teams: the unique account completion key makes the losing transaction
roll back. Existing team members are backfilled as completed by the migration.
Completion survives loss of membership; invitation acceptance records it in the
same transaction as joining the invited team.

All projects belong to teams. Every team member can access those projects and
edit requirements. Only the team Owner and Admins create projects and manage project
names, settings, and archive/restore. This replaces per-project access membership;
TeamProjects adds a required project team foreign key and backfills one team per
legacy project. Access to projects and requirements is inherited from current team
membership. Legacy project membership writes return 410; member reads reflect the
team. Project responses include team ID/name, caller role, and active requirement
count; the historical ownerUserId remains creator provenance, not a permission. No shared database migration or deployment happens in this task.

Consequences: TeamNavigationOnboarding adds private member preferences and an RLS-
protected completion table without modifying Better Auth's schema. Member data is
read through membership-checked C# endpoints. Member controls and settings use the
agreed rules below. Archive restoration and invitation choices are recorded here.
Claude's visual-polish work remains separate.

Coordination refinement: Claude also owns the global `/projects` pages and
project creation/deletion UI. Teams work implements the team-specific compact
Projects table and C# team ownership/access contracts, leaving those web pages
untouched. Before applying the ownership migration, any existing project becomes
its own team, retaining its owner and members as that team's Owner and Members.
This preserves access without combining unrelated collaborators.

Membership refinement: Existing and new accounts join only after invitation
acceptance. Admins remove regular Members; only the Owner removes Admins. Nobody
removes the Owner. The Owner alone appoints/demotes Admins, using a role dropdown
and explicit Save button in each member row. Removing a member or leaving uses a
confirmation dialog naming the person/team and an explicit Remove/Leave button.
The Owner must transfer ownership before leaving. Transfer can select any existing
member, requires confirmation naming the team and recipient, and makes the previous
Owner an Admin. Settings is one page: name/description with Save, then ownership
transfer and Leave team. Owners/Admins edit name and description; transfer is
Owner-only. Invitations are designed in their own slice.

Invitation refinement: Invite people opens an email/role dialog from Members; View
invitations opens a compact table with email, role, inviter, expiry, status, Resend,
and Revoke. Only Owners/Admins access management; Owners manage Admin/Member
invitations and Admins manage Member invitations. Delivery uses the existing email
service and offers immediate Copy link. Links last seven days. Resend rotates the
secret and invalidates the previous link. Acceptance requires the inviter's current
permission, a verified account matching the invited email, and completes onboarding
atomically with membership. New accounts accepting an invite do not name a separate
initial team. Acceptance uses a focused full-page screen matching onboarding,
showing team name, inviter, invited email, role, and Accept invitation. Sign-in and
signup preserve that destination. Token previews are public but grant no access;
only acceptance by the verified matching account completes setup. Unavailable links
and wrong accounts do not bypass onboarding. Accepted links cannot rejoin a removed
member. Only SHA-256 hashes of random 32-byte invitation secrets are stored.

ADR-041: After the merge with teams, project work follows team roles

Status: Accepted

Context: The projects, requirements, evidence, and review work (ADR-026 to ADR-038)
and the teams work (ADR-039, ADR-040) were built on separate branches from the same
commit. The first assumed a project has one owner and its own members; the second
made every project belong to a team, with access from team membership and
management by the team's Owner and Admins. The user's decision is that a project is
always owned by a team and a user always has a team from onboarding.

Decision: Team rules win wherever the two met. A project is created in a team the
user owns or administers: the create form asks for the team, offers only those
teams, and can be opened for one team with `/projects/new?team=<id>`, which the
team's project list links to. Connecting or disconnecting a project's GitHub
repository needs the team's Owner or an Admin, like renaming and archiving a
project (this changes ADR-032, which allowed only the project's creator). The web
decides what to show from the project's `teamRole`, not from `ownerUserId`, which
is now only who created the project. Review decisions are unchanged: any member of
the project's team except the requirement's author (ADR-038). The decision numbers
of the teams work were changed from 026 and 027 to 039 and 040 because both
branches had used 026 and 027.

Consequences: A second reviewer now joins by accepting a team invitation;
`POST /projects/{projectId}/members` answers 410, so the workaround named in ADR-038
is gone. A team Member cannot create a project or connect a repository and is told
why. The two branches' migrations interleave by timestamp; EF applies them in that
order and each applies cleanly because the evidence and review tables only refer to
projects and requirements. TeamProjects turns each existing project into its own
team, so projects created before the merge appear as one team per project. The
team pages keep the styles they were built with and have not been brought into the
black-and-white system of ADR-027.

ADR-042: Remember finished setup in a signed cookie, and read page data once per render

Status: Accepted

Context: The page gate (ADR-023) asked the API whether first-team setup was finished
on every navigation, including link prefetches. Each check exchanged the session for
a token and made a call to the API host, so every signed-in page waited on the API
even when the answer could not have changed. Server pages also exchanged the session
for a token once per API read, and loaded the data a page shows one read after another.

Decision: After the API answers that setup is finished, the gate sets the HttpOnly,
SameSite=Lax cookie `specthread.onboarded`, holding the user ID and an HMAC-SHA256 of
it keyed by BETTER_AUTH_SECRET (`app/web/src/lib/onboarding-cookie.ts`). A cookie that
verifies for the signed-in user skips the API call; any other value falls back to
asking the API. Finishing setup is permanent (the API only adds that record), and the
API still refuses to create projects before it, so a forged or stale cookie can at
most skip the redirect to /onboarding. Within one server render, `apiFetch` exchanges
the session for a token once, team pages look up the session once, and pages start
the API reads they need together rather than in sequence.

Consequences: Only the first signed-in navigation in a browser asks the API about
setup. Rotating BETTER_AUTH_SECRET invalidates the cookie, which costs one API call
per user. The API answers and authorizes every read as before, so the parallel reads
change no access rules; a requirement in another project still shows the not-found
page before anything renders.

ADR-043: No token on every session read, and small database pools

Status: Accepted

Context: Pages took about two seconds against the hosted database. Counting database
statements for one page view in the browser-test stack showed that, besides the work
ADR-042 removes, the jwt plugin signed a token on every session read (reading the
signing key each time) and returned it in a header nothing used. Separately, the dev
server's log showed Supabase refusing connections ("max clients reached in session
mode ... pool_size: 15"): the web opened up to 10 connections per copy of its auth
module (the page gate and the pages each had one, and every dev reload added another)
and the API up to 100, against 15 shared by every running copy of both.

Decision:
- The jwt plugin no longer signs a token on every session read
  (`disableSettingJwtHeader`). Tokens are created only where the server calls the API
  (`app/web/src/lib/api.ts`), so the browser is no longer handed a token for the API.
- One auth instance, and so one database pool, per web server process
  (`app/web/src/lib/auth.ts` keeps it on `globalThis`). A change to the auth setup
  needs a dev server restart to take effect.
- The web's pool holds at most 4 connections (`auth-config.ts`). The API's holds at
  most 5 unless the connection string sets its own `Maximum Pool Size`
  (`app/api/Program.cs`). Requests beyond the cap wait for a free connection.

Consequences: Access rules are unchanged. The caps make running out of the session
pooler's 15 connections unlikely, not impossible, when local development, Vercel, and
Render share it; Supabase's transaction pooler (port 6543) is the lasting fix for the
running apps and is not set up or tested. An earlier version of this work also cached
API tokens for 60 seconds and finished onboarding for an hour in server memory; ADR-042
replaced both, so the statement counts measured with that version (dashboard 170 to
27, requirement page 300 to 69) have not been measured again for this combination.

ADR-044: CI applies migrations after a merge, then deploys the API

Status: Accepted

Context: Migrations were applied by hand (`dotnet ef database update` or the scripts in
docs/schema), and Render deployed the API on every commit to `main` by itself. Each
migration had to reach Supabase before the API that needs it, so a merge meant a manual
step that was easy to forget or to do in the wrong order. ADR-007 forbids applying
migrations on API startup and any second migration history.

Decision: The CI job `deploy-api` (.github/workflows/ci.yml) runs on pushes to `main`
only, after `verify` and `api-image` pass. It builds an EF Core migration bundle, applies
the pending migrations to Supabase with the `DATABASE_MIGRATION_CONNECTION_STRING`
secret, and then calls Render's deploy hook (`RENDER_DEPLOY_HOOK_URL`) with `ref` set to
the same commit. Both secrets live in the GitHub environment `api-deploy`, not in the
environments Render and Vercel create for their own deployments. Render's auto-deploy is
off (`autoDeployTrigger: off` in render.yaml). One deploy runs at a time and is never
cancelled partway through. EF remains the only migration history.

Consequences: A merge reaches the API only after its checks pass and its migrations are
applied; a failed migration stops the job and nothing is deployed. Between the migration
and the new API starting, the previous API runs against the new schema, so every
migration must work with the API version already running: drop or rename a column only
after a deploy that no longer uses it. Rollback stays manual (`dotnet ef database update
<previous migration>` or the matching rollback script). If the job is skipped or fails,
deploy the API from the Render dashboard only after the migrations are applied. The web
app still deploys from Vercel on merge, independently of this job.

ADR-045: A failed setup check is logged and skipped, not fatal

Status: Accepted

Context: The page gate (ADR-023) asks the API whether first-team setup is finished until
the cookie of ADR-042 exists. When that call failed (the API unreachable, misconfigured, or
rejecting the web app's tokens), the gate threw, and every signed-in page answered a bare
500. On spec-thread.com the landing Dashboard link then did nothing and team pages showed
"Internal Server Error".

Decision: When the setup check fails, the gate logs the status (or the error and its cause)
and lets the page render without setting the cookie, so the next navigation asks again.
The session check before it is unchanged and still fails closed. This refines ADR-042,
which assumed the check succeeds.

Consequences: Pages that need the API show their own error states instead of a bare 500.
While the API is failing, a user who has not finished setup can open workspace pages
instead of being sent to /onboarding; the API still refuses project creation before
setup, so this changes no access rule.

ADR-046: Serve the web app next to its data, and absorb brief failures

Status: Accepted

Context: On spec-thread.com pages sometimes showed their error state, and a refresh loaded
them; pages were also slow. The web app ran in Vercel's default region (Washington, D.C.)
while Supabase (us-west-2) and the Render API (oregon) are in Oregon, so each of a page's
sequential database and API calls crossed the country. Every Vercel instance and preview
opened its own pool against the session pooler, which allows 15 connections in total.
`apiFetch` had no timeout or retry, an idle connection the database dropped crashed the
process through pg's unhandled "error" event, and the sidebar replaced a team list it
already showed with an error whenever a refresh failed.

Decision: Run the web app's server code in Vercel's `pdx1` region. Connect the deployed web
app through Supabase's transaction pooler (port 6543), with at most 4 connections per
instance and a 10-second idle timeout; the API keeps the session pooler. Handle the pool's
"error" event by logging it. `apiFetch` gives every call a 10-second timeout and retries a
GET once, after 300 ms, on a network error, a timeout, or 500/502/503/504; writes are never
retried. The token exchange is retried once the same way. The sidebar keeps a list it
already shows when a refresh fails, and retries a failed first load once.

Consequences: Fewer cross-country round trips per page, and a brief failure costs a
300 ms retry instead of an error page. A GET that fails for good takes one retry longer to
show its error. Vercel's `DATABASE_URL` must point at port 6543; the region must follow
the database and API if they move.

ADR-047: Project reference documents stored in PostgreSQL, in a Documentation tab

Status: Accepted

Context: Teams need one place in each project for reference documents (PDF, DOC, DOCX)
that everyone on the project's team can read; requirements will cite them in a later
task. The user chose PostgreSQL storage over Supabase Storage to avoid a new service and
secret. The web runs on Vercel, whose functions accept and return at most 4.5 MB bodies,
and browsers reach the API only through Next.js (ADR-024).

Decision: Metadata lives in `documents` and the bytes in `document_contents` (bytea, one
row per document), so lists never read file contents. Files are at most 4 MiB
(4,194,304 bytes) and must be .pdf, .doc, or .docx; the API checks that the file starts
with that format's signature (`%PDF-`, the OLE header, or the ZIP header) and stores a
content type derived from the extension, never the client's. File names lose any path
and control characters and are at most 255 characters; titles are optional (default:
the file name without its extension), at most 200. Database check constraints repeat
the type and size rules. Any member of the project's team uploads (multipart
POST /projects/{id}/documents), lists, downloads, and archives, like requirements
(ADR-041); writes lock the project's team as other project writes do. There is no
delete. Archived documents leave the list but stay downloadable, and archived projects
refuse uploads and archiving (409). Downloads are attachments with
`X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`. The upload
endpoint disables antiforgery because the API authenticates bearer tokens, not cookies.

In the web, Documentation is a project tab (ADR-028) with a list, an upload page, and a
page per document with its download link and the archive action, which asks for
confirmation. A Next.js route handler reads each download in full within the API call's
timeout, so a failed transfer returns 502 rather than a truncated file, and answers 404 when the
document belongs to a different project than the address says. Server actions accept
5 MB bodies for the upload form. `apiFetch` sets a JSON content type only for string
bodies, so multipart uploads keep their boundary.

Consequences: Files count against the database size (500 MB on Supabase's free plan),
and archiving frees nothing; a size report or purge job may be needed later. Larger
files need direct-to-storage uploads, which would supersede this decision. DOC and DOCX
contents beyond the header are not inspected, and files are not virus scanned. A
download reads the whole file into API and web memory, which the size limit bounds, and costs
two API calls from the web (metadata, then content). Requirement references to
documents (since added by ADR-049), search, renaming, and unarchiving are future work. Migration
ProjectDocuments adds both tables with RLS on and browser grants revoked; CI applies it
(ADR-044).

ADR-048: Writes that read GitHub lock the team only to save, and get a longer web timeout

Status: Accepted

Context: Requirement, project, and document writes lock the team row so they cannot
commit into a project being archived or for a member being removed (ADR-040, ADR-047).
Evidence link, refresh, and unlink, review decisions, and repository connect and
disconnect did not, and a refresh that met a concurrent unlink failed with an unhandled
500. Two links at once could also pass the 50-link limit. Separately, the web app gave
every API call 10 seconds (ADR-046), while a refresh makes several GitHub calls per
linked item and one per release and change pair, so refreshing a requirement with
many links failed in the browser.

Decision: Every evidence, review, and repository write runs in a transaction that locks
the project's team and then re-reads membership and archived state, through
`RequirementEndpoints.LockForMember` or `ProjectEndpoints.LockProjectForCaller`.
Writes that read GitHub (link, refresh, connect) read it first, without the lock, so
a slow GitHub never holds up the team's other writes; they then lock, check again
that the caller is a member, nothing is archived, and the same repository is still
connected, and save. Link counts the links again under the lock. A row that changed
or disappeared while GitHub was being read answers 409 ("reload and try again")
instead of saving partial results. `apiFetch` accepts a per-call `timeoutMs`; link and
refresh use 55 seconds, and the requirement page sets `maxDuration = 60` so Vercel lets
its server actions run that long. Every other call keeps the 10-second limit and the
GET retry.

Consequences: A write can wait briefly for another write in the same team. A refresh
that loses a race is refused, not merged, so the user refreshes again. The first refresh
of a requirement with many releases and many merged pull requests can still approach
the 55-second limit, because each release and change pair is a GitHub compare call;
later refreshes reuse earlier "included" answers. No schema change.

ADR-049: Requirements need a criterion and link project documents in the requirement form

Status: Accepted

Context: The "create a requirement" story (docs/PROJECT.md) says a requirement can't be
saved without a title and at least one acceptance criterion, and records who created it
and when. The API accepted zero criteria, and the requirement page showed when it was
updated but not when it was created. The team also asked for requirements to link the
project's reference documents (ADR-047), which that decision left for later.

Decision: Create and save refuse an empty `acceptanceCriteria` with 400 on that field,
and the web form checks the same rule; a form with no criteria starts with one empty
row. The rule lives in the API, not a database constraint, because it counts rows. The
page shows "Created by <name> on <date>" from the stored `created_by` and `created_at`.

Documents are linked in the requirement form and saved with the requirement, like its
criteria: `POST` and `PUT` take `documentIds`, and `PUT` replaces the list. A link
belongs in the requirement's version, so changing links raises the version and marks
an earlier review outdated, as other edits do. Links live in `requirement_documents`
(requirement, document, `linked_by`, `linked_at`); a save keeps the rows of documents
that stay linked and adds or removes only the difference, so each link records who made
it and when. A requirement links at most 20 distinct documents, all from its own
project, checked under the team lock. Only active documents can be newly linked. A
document archived after it was linked stays linked, is marked archived on the page and
in the form, and is unlinked by unticking it. `Requirement` responses carry the linked
documents' metadata, ordered by title.

Consequences: Existing requirements with no criteria stay readable but need one before
their next save. Linking or unlinking a document needs a full requirement save and a
new version; a separate link endpoint, as for evidence, would supersede this if links
need to change without editing the requirement. A document's page does not yet list the
requirements that link it. Migration RequirementDocuments adds the table with RLS on
and browser grants revoked; CI applies it (ADR-044), and its rollback removes only the
links.

ADR-050: Requirements record their last editor, list archives on request, and can be restored

Status: Accepted

Context: The requirements story asks that edits save the editor's name and a timestamp,
that archived requirements leave the default list but still open read-only, and that
they can't be edited or reviewed until restored. Requirements stored only when they
were last changed, the web had no way to list archived ones, and archiving could not be
undone (ADR-024).

Decision: `requirements.updated_by` records who saved the current version, next to the
existing `updated_at`; create and every save set both. Only the latest edit is kept;
an edit history was considered and deferred (the user's choice). The column is
nullable so that the API still running during a deploy (ADR-044) can keep creating
requirements; the migration backfills existing rows with their creator, and the API
reports the creator for any row left empty. The page reads "Updated by <name> on <date>".

`GET /projects/{id}/requirements` stays active-only by default and takes
`archived=true` for archived ones, like team projects; the Requirements tab links to an
Archived view. `POST /requirements/{id}/restore` clears `archived_at`. Any team member
restores, as any member archives (ADR-041), and both are refused in an archived
project. Restoring does not raise the version or change the last editor, so a review
that was current before archiving still is. While archived, saves, evidence changes,
and review decisions keep answering 409.

Consequences: Who made earlier edits, and what they changed, is not recorded; a
history table would extend this (ADR-051 later keeps every version of the criteria, though
not of the title or description). Archiving is no longer final, so anyone in the team can
undo it. Migration RequirementUpdatedBy adds the column, its index, and a foreign key to
`user`; its rollback drops only the column.

ADR-051: Acceptance criteria are versioned, and changing accepted criteria needs confirmation

Status: Accepted

Context: Two stories from the scenario "Changing a requirement after its code was
merged". Danielle (Tech Lead) wants a warning before editing the criteria of an Accepted
requirement, so a client's approval is not silently changed: the warning explains that
the acceptance applies to the previous criteria; confirming returns the requirement to
needing review with the earlier decision kept in its history; cancelling changes
nothing. Robert (Client Reviewer) wants every saved change to the criteria kept as a
timestamped version, each decision to show the version it was made against, and earlier
versions to open read-only. Criteria rows were replaced on every save, so earlier text
was lost (ADR-024), and decisions stored only the requirement version (ADR-038).

Decision: `requirement_criteria_versions` keeps each requirement's criteria as an
ordered JSON array of texts, numbered from 1, with who saved it and when. Creating a
requirement writes version 1; a save writes the next version only when the ordered,
trimmed texts differ from the latest, so title, description, and document changes do
not. Rows are only added. `requirement_reviews.criteria_version` records the version a
decision was made against. Members read the versions through
`GET /requirements/{id}/criteria-versions` and `/criteria-versions/{number}`; archived
requirements stay readable.

When the latest decision is `accepted` and was made against the current criteria
version, a save that changes the criteria is refused with 409 and
`code: "accepted_criteria_change"` unless it sends `confirmCriteriaChange: true`. The
form shows the warning before sending anything: who accepted which version and when,
that the acceptance applies to the previous criteria, and that saving will need a new
review. "Keep editing" closes it and sends nothing; "Save and request a new review"
saves with the confirmation. The 409 also catches an acceptance recorded after the form
was loaded. No decision row is written on confirmation: "needs review" is derived, like
"outdated". The list's `review.criteriaChanged` is true when the latest decision's
criteria version differs from the current one, and the list then shows "Needs review"
(amber, ADR-027) instead of the decision; the requirement page explains it and links
the decision to the version it was made on. The earlier decision stays in the history
unchanged. Only the latest decision counts: after a newer rejection, criteria change
without confirmation.

The migration is additive so the API still running during a deploy keeps working
(ADR-044): the review column is nullable. It writes version 1 for every existing
requirement from its current criteria, credited to the last editor at `updated_at`, and
stamps version 1 on decisions made on the current requirement version, which saw those
criteria; other decisions stay unstamped and read "Criteria version not recorded".

Consequences: A requirement the previous API saved during a deploy has criteria that no
version holds; the next save or decision first adds a catch-up version credited to its
last editor, and a decision the previous API recorded has no criteria version. Only
criteria are versioned; earlier titles and descriptions are still not kept. Reordering
criteria makes a new version and so needs a new review. The Requirement history page
now lists the versions with the decisions made on each. Migration
RequirementCriteriaVersions adds the table (RLS on, browser grants revoked) and the
column; its rollback drops both, losing every version and every decision's stamp.
Migration RequirementCriteriaVersionTexts then limits `criteria` to an array of strings,
since nothing else can be read back; its rollback restores the array-only check.

ADR-052: Requirements can be marked as follow-ups of other requirements

Status: Accepted

Context: From the same scenario, Danielle wants to mark a requirement as a follow-up of
another so later changes are traceable without rewriting what was accepted: a
requirement can reference one or more related requirements in the same project, both
show the relationship with a link to the other, and adding or removing it is recorded
with a name and a timestamp. The user chose a directional "follow-up of" link over a
symmetric "related" one.

Decision: `requirement_follow_ups` holds one row per link, from the follow-up to the
requirement it follows up, with who linked it and when. `requirement_follow_up_events`
records every add and remove with the person and time; its rows are only added. Any team
member links (`POST /requirements/{id}/follow-ups { originalRequirementId }`) and unlinks
(`DELETE /requirements/{id}/follow-ups/{originalId}`) under the team lock (ADR-048). The
other requirement must be in the same project and active; a requirement can't follow up
itself, a link can't be added in both directions, and a requirement follows up at most
20 others (400). An existing link, or an archived requirement or project, is 409. The
GET returns the links both ways and every change touching the requirement, newest
first. The requirement page shows "Follow-up of" with Remove and an add control, and
"Followed up by", each linking to the other requirement; the history is on the page and
on the Requirement history page. Links do not change either requirement's version, so
they never make a decision outdated.

Consequences: Only direct links are shown; chains are followed one page at a time. An
archived original stays linked and is marked Archived. The history shows current titles,
not the titles at the time. Migration RequirementFollowUps adds both tables (RLS on,
browser grants revoked); its rollback drops them, losing the links and their history.

ADR-053: One milestone label per requirement, and a fixed Evidence complete rule

Status: Accepted

Context: Danielle (Tech Lead) and Angela (Instructor), in the scenarios "Signing off a
contract milestone" and "Checking student team progress", want to review one set of
requirements at a time: a requirement can be assigned to one milestone or sprint label,
the list can be filtered by it, and the filtered list shows how many are Evidence
complete and Accepted. No evidence policy existed, so "Evidence complete" was only
product language (docs/PROJECT.md). The user chose a free-text label over a managed
milestone list, and a fixed built-in rule over a configurable policy.

Decision: `requirements.milestone` holds an optional label of up to 100 characters,
trimmed, empty meaning none. It is set when creating a requirement or through
`PUT /requirements/{id}/milestone`, which any member can call. Setting it is not an
edit: the version and last editor stay, so no decision becomes outdated.
`GET /projects/{id}/requirements?milestone=` filters by exact label and combines with
`archived=true`; `GET /projects/{id}/milestones` lists the labels on active requirements
for the filter and for suggestions. Each listed requirement carries `milestone` and
`evidenceComplete`.

A requirement is Evidence complete when at least one pull request or commit is linked,
the checks of every linked pull request and commit could be read, none of them failed,
is still running, or was cancelled (passed, skipped, and neutral are fine), and at least
one passed. Issues and releases neither count nor block. The rule lives in the API
(`EvidencePolicy`), not the web, and stays separate from Accepted (ADR-004). The list
shows counts above the rows ("Sprint 1 · 2 requirements · 1 Evidence complete · 1
Accepted"); Accepted counts a latest decision of accepted that is neither outdated nor on
earlier criteria.

Consequences: Labels match exactly, so "Sprint 1" and "sprint 1" are two milestones;
the suggestions reduce that. There is no milestone record, date, or rename; the
Milestones page stays a placeholder. The rule is a fixed stand-in until a configurable
evidence policy exists, and check results are as fresh as the last GitHub refresh.
Migration RequirementMilestone adds the column and its check; its rollback drops it,
losing every label.

ADR-NNN: Title

Status: Proposed, Accepted, Superseded, or Rejected

Context:

Decision:

Consequences:
