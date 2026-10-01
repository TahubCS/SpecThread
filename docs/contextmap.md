# SpecThread agent context map

Fresh agent · `main@2e6eb9c` · 2026-10-01 · k = 1,000 tokens · tokens ≈ bytes ÷ 2.65 (calibrated on `HANDOFF.md`: 72,731 B = 27,497 tok), ±20%

- **Indent** = the file above sent the agent here. **Siblings** = alternative paths. **`a + b`** = read together. **`@`** and **`=`** = running total.
- **`[XX]`** = who requested the read: `AG` AGENTS.md · `AR` ARCHITECTURE.md · `WF` WORKFLOW.md · `HO` HANDOFF.md · `DE` DECISIONS.md · `DB` DATABASE.md · `DP` DEPLOYMENT.md · `SK` skill index

## Reading paths

- **L0 FRESH AGENT @ 25.0k** = harness ≈ 22.0k (system prompt + tool schemas + skill index; estimate) + `CLAUDE.md` → `AGENTS.md` 3.0k (auto-loaded)\
  `[AG]` "read in order": `PROJECT.md` 1.6k + `ARCHITECTURE.md` 3.1k + `WORKFLOW.md` 2.1k + `HANDOFF.md` 27.5k + `DECISIONS.md` 10.0k = +44.3k → **every plan below starts @ 69.3k**
	- **L1 WEB FEATURE** (app/web: turn scaffold pages into real UI)
		- **L2 1a** UI on an agreed mock contract
			- `[AG,AR,WF]` `TESTING.md` 3.4k
				- docs sufficient **@ 72.7k**
				- src +22.4k `(requirements/page.tsx, scaffold-page, scaffold-routes, app-navigation, app-frame, workspace-sidebar, dashboard-preview, app-shell.css, globals.css, e2e/{scaffold.spec,fixtures})` **= 95.1k → implement**
		- **L2 1b** page wired to the API (first JWT-bearing fetch)
			- `[AG,AR,WF]` `TESTING.md` 3.4k + `[AR]` `DEPLOYMENT.md` 5.3k
				- docs sufficient **@ 78.0k**
				- src +15.6k `(dashboard/page, dashboard-preview, lib/{auth,auth-client,create-auth,auth-config}, proxy.ts, web/.env.example, api/{Program,Data/ProductModels}.cs, playwright.config, e2e/{home.spec,fixtures}, support/api-process, start-test-web.mjs)` **= 93.6k → implement**
		- **L2 1c** auth-facing page (account, two-factor)
			- `[AG,AR,WF]` `TESTING.md` 3.4k + `[AR]` `DEPLOYMENT.md` 5.3k
				- `[SK]` `.agents/skills/{better-auth-best-practices,two-factor-authentication-best-practices}/SKILL.md` 6.2k (only tools that index `.agents/skills`)
					- docs sufficient **@ 84.2k**
					- src +23.8k `(settings/account/page, auth-form, account-panel, password-forms, auth-layout, lib/{auth-client,create-auth,auth-config,sign-in-methods}, proxy.ts, public-pages.css, e2e/{auth.spec,fixtures}, schema/auth-email.spec)` **= 108.0k → implement**
	- **L1 API FEATURE** (app/api: ASP.NET Core endpoints)
		- **L2 2a** endpoint + persistence on existing tables (requirement create/list)
			- `[AG,AR,WF]` `TESTING.md` 3.4k + `DATABASE.md` 2.3k
				- docs sufficient **@ 75.0k**
				- src +13.2k `(Program.cs, Auth/AuthenticationSetup.cs, Data/{ProductModels,SpecThreadDbContext}.cs, .csproj, api/.env.example, tests/api/{auth-jwt,health}.spec, support/api-process, schema/migration.spec, scripts/{start-test-jwks,start-test-web,test-database}.mjs, playwright.config)` **= 88.2k → implement**
		- **L2 2b** project-membership authorization (the handoff's stated next step)
			- `[AG,AR,WF]` `TESTING.md` 3.4k + `DATABASE.md` 2.3k
				- docs sufficient **@ 75.0k**
				- src +11.7k `(Program.cs, Auth/{AuthenticationSetup,JwksRetriever}.cs, Data/{AuthModels,ProductModels,SpecThreadDbContext}.cs, tests/api/{auth-jwt,auth-unconfigured}.spec, support/api-process, schema/auth-jwt-runtime.spec, scripts/{start-test-jwks,test-database}.mjs, playwright.config)` **= 86.7k → implement**
	- **L1 DATABASE CHANGE** (EF Core migration)
		- **L2 3a** new or changed product tables
			- `[AG,AR,WF]` `DATABASE.md` 2.3k + `TESTING.md` 3.4k
				- `[DB]` `docs/schema/{initial,rollback}.sql` 3.0k
					- docs sufficient **@ 78.0k**
					- src +16.9k `(Data/{ProductModels,AuthModels,SpecThreadDbContext}.cs, Migrations/{InitialSchema,AuthRateLimits}.cs, scripts/{generate-auth-rate-limits,test-database}.mjs, schema/migration.spec, api/ef.spec, dotnet-tools.json)` **= 94.9k → implement**
		- **L2 3b** Better Auth-owned tables (new auth plugin or columns)
			- `[AG,AR,WF]` `DATABASE.md` 2.3k + `TESTING.md` 3.4k
				- `[DB,DE]` `docs/schema/{better-auth-1.7.5.json,auth-rate-limits*.sql}` 2.4k + `[DB]` `DEPLOYMENT.md` 5.3k
					- docs sufficient **@ 82.7k**
					- src +16.0k `(Data/{AuthModels,SpecThreadDbContext}.cs, Migrations/AuthRateLimits.cs, web lib/{create-auth,auth-config}, scripts/{generate-auth-rate-limits,test-database}.mjs, schema/{auth-runtime,migration}.spec)` **= 98.7k → implement**
	- **L1 GITHUB INTEGRATION** (external API connection; nothing exists yet beyond OAuth sign-in)
		- **L2 4a** repository connection (outbound API adapter + new table)
			- `[AG,AR,WF]` `TESTING.md` 3.4k + `DATABASE.md` 2.3k + `[AR]` `DEPLOYMENT.md` 5.3k
				- `[DB]` `docs/schema/initial.sql` 2.8k
					- docs sufficient **@ 83.1k**
					- src +10.8k `(Program.cs, Auth/AuthenticationSetup.cs, Data/{ProductModels,SpecThreadDbContext}.cs, .csproj, api/.env.example, render.yaml, web lib/{auth-config,create-auth}, repository/page.tsx, api/auth-jwt.spec, support/api-process, playwright.config)` **= 93.9k → implement**
		- **L2 4b** webhook ingestion (signature check, idempotent processing)
			- `[AG,AR,WF]` `TESTING.md` 3.4k + `DATABASE.md` 2.3k + `[AR]` `DEPLOYMENT.md` 5.3k
				- docs sufficient **@ 80.3k**
				- src +8.6k `(Program.cs, Auth/AuthenticationSetup.cs, Data/{ProductModels,SpecThreadDbContext}.cs, .csproj, api/.env.example, render.yaml, Dockerfile, tests/api/{health,auth-unconfigured,auth-jwt}.spec, support/api-process, playwright.config)` **= 88.9k → implement**
	- **L1 OPS** (rollout, environment, CI)
		- **L2 5a** production rollout or env/secret change (e.g. the pending ES256 rollout)
			- `[AR,HO]` `DEPLOYMENT.md` 5.3k
				- `[DP]` `TESTING.md` 3.4k + `DATABASE.md` 2.3k
					- docs sufficient **@ 80.3k**
					- src +6.5k `(render.yaml, Dockerfile, .dockerignore, vercel.json, next.config.ts, web/.env.example, api/.env.example, lib/{auth-config,create-auth}, Auth/AuthenticationSetup.cs, package.json)` **= 86.8k → implement**
		- **L2 5b** CI or test-harness change
			- `[AG,AR,WF]` `TESTING.md` 3.4k
				- docs sufficient **@ 72.7k**
				- src +5.6k `(.github/workflows/{ci,enforce-pr}.yml, playwright.config, package.json, scripts/{build-api,start-test-web,start-test-jwks,stop-test-web-database,test-database}.mjs, global.json, dotnet-tools.json, eslint.config.mjs, tsconfig.json)` **= 78.3k → implement**

## Reading the numbers

- Before the first edit: **78.3k–108.0k** = 39–54% of a 200k window (8–11% of 1M). Harness + docs are 72.7k–84.2k of that; src is only 5.6k–23.8k.
- `HANDOFF.md` alone is 27.5k: 62% of the mandatory read and over the 25k single-Read cap (2 reads). Its newest 3 entries are 2.6k.
- Not counted: the task prompt, tool-call overhead, web docs (e.g. GitHub API for plan 4), and everything after the arrow (diffs, test and build output).
