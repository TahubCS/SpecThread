# SpecThread

SpecThread connects requirements to inspectable implementation evidence from
GitHub, checks, and releases. A human reviewer makes the acceptance decision.

## Structure

```text
app/web/                  Next.js App Router application (TypeScript)
app/api/                  ASP.NET Core 10 API and EF Core context
tests/                    Playwright browser and API tests
docs/                     Product, architecture, workflow, and handoff
.github/workflows/ci.yml   Foundation checks
playwright.config.ts      Shared test runner and managed local servers
global.json               .NET SDK selection
dotnet-tools.json         Pinned local EF Core migration tool
package-lock.json         Single npm workspace lockfile
```

## Setup

Install Node.js 24 (verified with 24.13.0), npm 11 (11.7.0), and .NET SDK
10.0.401 or a later patch in that SDK feature band. From the repository root:

```sh
npm ci
dotnet restore app/api --locked-mode
dotnet tool restore
npx playwright install chromium
```

Run the apps in separate terminals:

```sh
npm run dev       # Web: http://localhost:3000
npm run dev:api   # API: http://127.0.0.1:5100
```

`GET /health` returns `{ "status": "ok" }` without accessing the database.
Development OpenAPI is at `http://127.0.0.1:5100/openapi/v1.json`.
No product endpoints, authentication, or product tables are implemented yet.

The web skeleton has `/`, `/login`, `/signup`, and `/dashboard`. Login and signup
show disabled GitHub actions; the dashboard is an explicitly public, empty preview.
Navigation works, but no account is created and no product data is stored.

## Checks

```sh
npm run lint
npm run typecheck
dotnet format app/api --verify-no-changes --no-restore
npm run build
npm run build:api
npm test
```

`npm test` builds and starts both applications. Stop a manually started API
first and keep ports 3100 and 5100 free. Builds currently download Google Fonts.
Use `npm test -- --list` for discovery, `npm run test:ui` for interactive runs,
and `npm run test:report` for results. See [TESTING.md](docs/TESTING.md).

## Database and team workflow

Supabase hosts PostgreSQL. EF Core with Npgsql owns API database access and
future migrations. Initialize and verify EF Core before database execution.
No database credentials are needed for current smoke tests. Follow
[DATABASE.md](docs/DATABASE.md) before configuring live access. Environment
examples contain placeholders; ASP.NET does not automatically load `.env`.
Supabase MCP login is separate from application database authentication.

Read [PROJECT.md](docs/PROJECT.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md),
[WORKFLOW.md](docs/WORKFLOW.md), and [HANDOFF.md](docs/HANDOFF.md).
Ask before creating a task branch; if the user chooses the current branch,
stay there. This foundation task is on `main` by explicit instruction.
