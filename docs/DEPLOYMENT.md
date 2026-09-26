# Deployment Guide

SpecThread consists of two deployable applications hosted on cloud platforms:
1. **Web Client (`app/web`)**: Next.js App Router deployed to **Vercel**.
2. **API (`app/api`)**: ASP.NET Core 10 Web API deployed to **Render** using a multi-stage Docker container.
3. **Database**: PostgreSQL hosted on **Supabase**.

---

## 1. Web Deployment (Vercel)

### Setup Steps
1. Navigate to [vercel.com](https://vercel.com) and click **Add New > Project**.
2. Connect your GitHub account and select the **SpecThread** repository.
3. In the **Configure Project** screen:
   * **Framework Preset**: Select `Next.js`.
   * **Root Directory**: Click **Edit** and choose `app/web`.
   * **Build and Output Settings**: Leave default (`next build`, output `.next`).
4. Under **Environment Variables**, configure the following:

| Variable | Description | Example |
|---|---|---|
| `BETTER_AUTH_SECRET` | Required random secret, at least 32 characters; no fallback | Generate via `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Canonical public URL of your Vercel deployment | `https://your-app.vercel.app` |
| `DATABASE_URL` | Supabase connection string for Better Auth auth tables | `postgres://postgres.[ref]:[pass]@[host]:5432/postgres` |
| `DATABASE_CA_CERT` | Full PEM contents of the project's CA certificate when not trusted by Node | Copy the certificate contents, not its local path |
| `GITHUB_CLIENT_ID` | Client ID from your GitHub OAuth App | `Ov23li...` |
| `GITHUB_CLIENT_SECRET` | Client Secret from your GitHub OAuth App | `<secret>` |
| `GOOGLE_CLIENT_ID` | Client ID from your Google Cloud OAuth client (Google sign-in is off when unset) | `123-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Client secret from the same Google OAuth client | `<secret>` |
| `RESEND_API_KEY` | Resend API key for verification and password reset emails | `re_...` |
| `EMAIL_FROM` | Sender on a Resend-verified domain | `SpecThread <no-reply@yourdomain>` |
| `BETTER_AUTH_API_KEY` | (Optional) Better Auth Dashboard API key | `ba_...` |

5. Click **Deploy**.

### Required configuration before deploying the auth fixes

Set a random `BETTER_AUTH_SECRET`, the exact `BETTER_AUTH_URL`, and `DATABASE_URL`
for both builds and runtime. Missing configuration fails explicitly. Only the
configured origin is trusted; shared Vercel/ngrok wildcards are no longer allowed.
For a preview or tunnel, configure its exact HTTPS origin and corresponding
GitHub OAuth callback. HTTP is allowed only for loopback development.

Remote PostgreSQL connections always verify TLS certificates. Set
`DATABASE_CA_CERT` to the full PEM downloaded from Supabase (the existing public
certificate in app/api/certs may be used when it matches the project). Actual
newlines and literal `\n` are supported. Render's certificate installation does
not configure Node on Vercel. An empty CA setting uses Node's default trust store.
Only loopback databases allow plaintext for local tests. `DATABASE_SSL` is no
longer used. URL query parameters are rejected except `sslmode=require` and
`sslmode=verify-full`, which are removed before passing the URL to pg so they
cannot replace the explicit certificate-verification options.

CA values are parsed before creating the database pool. A partial, flattened, or
invalid PEM now produces an actionable DATABASE_CA_CERT configuration error
without printing its contents. Multiple complete PEM certificates are supported.
This validates the format; the TLS handshake still verifies the server's chain.

Set both GitHub credential variables together. Values are trimmed; a partial pair
fails explicitly. Leaving both blank deliberately disables GitHub for offline
tests. No new environment variables are required.

OAuth access and refresh tokens written through Better Auth are encrypted with
the auth secret. Existing prefixed plaintext GitHub tokens remain readable in
Better Auth 1.7.5, but enabling encryption does not rewrite existing rows or backups.
Reauthentication refreshes the stored tokens; older hex-only tokens may require
reauthentication because the library detects them as encrypted data. Keep the
current secret available: replacing it can make encrypted tokens unreadable.
Do not roll back to a version with encryption disabled after encrypted tokens
have been stored; keep the option enabled or arrange explicit reauthentication.

The dashboard plugin is disabled when `BETTER_AUTH_API_KEY` is absent. Rotate the
previously committed dashboard key in Better Auth before using this integration;
removing the source fallback does not revoke it. If a deployment used the old
default auth secret, replace it as well and expect existing sessions to require
sign-in again. No key rotation or production environment changes are automated.

References: [node-postgres TLS configuration](https://node-postgres.com/features/ssl)
and [Better Auth origin security](https://www.better-auth.com/docs/reference/security).

### GitHub OAuth Configuration
In your GitHub Developer Settings (OAuth Apps):
* **Homepage URL**: `https://your-app.vercel.app`
* **Authorization callback URL**: `https://your-app.vercel.app/api/auth/callback/github`

The team's current GitHub App is private: GitHub returns 404 at
`/login/oauth/authorize` for anyone except its owner. Make it public (GitHub App
settings > Advanced > Make public) or use an OAuth App before others sign in or
link GitHub.

### Google OAuth Configuration (ADR-016)
In Google Cloud Console > APIs & Services > Credentials, create an **OAuth client
ID** of type **Web application**, after configuring the OAuth consent screen:
* **Authorized JavaScript origins**: `https://your-app.vercel.app` (and `http://localhost:3000` for a development client)
* **Authorized redirect URIs**: `https://your-app.vercel.app/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google`)

Consider separate development and production clients.

### Email delivery (ADR-016)
1. In Resend, verify the sending domain (DNS records) and create an API key with
   sending access only.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel for every environment that
   runs the web app. Deployments without them fail explicitly at auth startup.
3. `EMAIL_DELIVERY=log` is only for loopback development and tests; it is rejected
   for any other `BETTER_AUTH_URL` because it prints one-time links.
4. After deploying, verify: sign up, receive the verification email, follow it,
   log in, request a password reset, follow it, and confirm other sessions were
   signed out. Link and unlink Google and GitHub from `/account`.

### Client IP headers and rate limiting

Better Auth prefers `x-vercel-forwarded-for`, then `x-forwarded-for`, for
client IP detection. This assumes the web application is reached through Vercel's
managed ingress. Do not add Cloudflare or other proxy headers without verifying
that the deployment strips client-supplied values and sets trusted replacements.
Reassess this configuration if another proxy is placed in front of Vercel.

Rate-limit counters use the shared PostgreSQL `rateLimit` table. Apply the
AuthRateLimits EF migration before deploying this version of the web app. Limits
retain Better Auth's defaults (enabled in production, disabled in development);
the database makes counters visible across serverless instances. Database outages
can now affect even unauthenticated auth endpoints because production requests
must consult the limiter. Monitor connection load and 429/5xx rates.
In a controlled Vercel deployment, verify client separation and header spoofing
resistance before treating the proxy behavior as verified. Local simulated-header
tests cannot prove Vercel's actual header handling.

References: [Vercel request headers](https://vercel.com/docs/headers/request-headers)
and [Better Auth rate limiting](https://better-auth.com/docs/concepts/rate-limit).

### Auth improvements rollout

1. Run the full checks in TESTING.md, including disposable PostgreSQL tests.
2. With the intended database connection configured, initialize EF with
   `dotnet ef dbcontext info --project app/api`, inspect migration history, and
   apply `dotnet ef database update AuthRateLimits --project app/api`.
   See DATABASE.md for SQL artifacts and rollback. Never migrate at API startup.
3. Deploy the web app only after the new table is present. No new auth environment
   variables are required. The browser client now uses its current origin;
   NEXT_PUBLIC_APP_URL is no longer used. Keep BETTER_AUTH_URL and GitHub's
   registered callback aligned with the exact domain being verified.
4. Verify successful GitHub login, provider cancellation, an expired callback,
   retry after an initiation error, and /auth/error on localhost and Vercel.
   The public error page does not require a session or database query and never
   renders raw provider error descriptions. GitHub-side configuration failures
   may never return to the app and cannot be handled by this page.
5. In a controlled Vercel environment, verify IP-header precedence and 429 behavior
   with a test account. Do not stress production or log full request headers,
   cookies, tokens, OAuth state, or personal IPs. Local simulated headers verify
   application logic but do not establish the real proxy's trust behavior.

Better Auth uses appName SpecThread and PostgreSQL joins. Local timings are
attached to the schema test report; they are not a production speedup guarantee.

---

## 2. API Deployment (Render)

The ASP.NET Core Web API is packaged as an unprivileged, multi-stage Linux container using the official Microsoft .NET 10 runtime images.

### Method A: Using the Render Blueprint (`render.yaml`)
1. In the Render Dashboard, click **New > Blueprint**.
2. Connect the **SpecThread** repository.
3. Render will detect [`render.yaml`](../render.yaml) and configure the `specthread-api` web service automatically.
4. Enter the required values for `ConnectionStrings__Database` and `Auth__Issuer` (the web app's exact origin, e.g. `https://web-alpha-lovat-61.vercel.app`, no trailing slash).
5. Click **Apply**.

### Method B: Manual Web Service Setup
1. In Render Dashboard, click **New > Web Service**.
2. Select your **SpecThread** GitHub repository.
3. Configure the service:
   * **Name**: `specthread-api`
   * **Runtime**: `Docker`
   * **Dockerfile Path**: `./Dockerfile`
   * **Docker Build Context Directory**: `.` (root directory)
   * **Instance Type**: `Free` or higher
4. Under **Advanced Settings**:
   * **Health Check Path**: `/health` (returns `{"status":"ok"}`)
   * **Environment Variables**:
     * `ASPNETCORE_ENVIRONMENT`: `Production`
     * `Auth__Issuer`: The web app's exact origin, matching Vercel's `BETTER_AUTH_URL` (e.g. `https://web-alpha-lovat-61.vercel.app`). Required for authenticated endpoints; see ADR-015.
     * `ConnectionStrings__Database`: Your Supabase Npgsql connection string (e.g. `Host=aws-0-us-west-2.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.hgcjtecsglksdbsmtcxt;Password=<PASSWORD>;SSL Mode=VerifyFull;`)
5. Click **Deploy Web Service**.

### TLS & Root CA Verification
The Supabase PostgreSQL cluster uses the `Supabase Root 2021 CA`. To support strict `SSL Mode=VerifyFull` without requiring environment-specific file paths on Render:
- The public root CA certificate is stored in `app/api/certs/prod-ca-2021.crt`.
- The Docker runtime image automatically copies this certificate to `/usr/local/share/ca-certificates/supabase-root-2021.crt` and executes `update-ca-certificates`.
- Linux OpenSSL and .NET `X509Chain` trust the certificate natively from `/etc/ssl/certs/ca-certificates.crt`. No `Root Certificate=` parameter is needed in your Render connection string.

### API token validation rollout (ADR-015)

Better Auth falls back to its newest live key, so a deployment that already
minted an EdDSA key keeps issuing EdDSA tokens after the ES256 change. In order:

1. Deploy the web change.
2. Once, with approval, expire the EdDSA keys in Supabase. Do this only after
   step 1: the previous web code mints a new EdDSA key on its next session check.
   ```sql
   UPDATE public.jwks SET "expiresAt" = now() WHERE alg IS NULL OR alg = 'EdDSA';
   ```
3. Set `Auth__Issuer` on Render and deploy the API.

The next token request mints an ES256 key. Expired keys stay published for Better
Auth's 30-day grace period and the API ignores them. Tokens last 15 minutes and no
client sent them to the API before this change, so users need not sign in again.
The schema test tests/schema/auth-jwt-runtime.spec.ts exercises this step.
Rollback: revert the web and API changes. Better Auth then keeps signing with the
ES256 key, its newest live key, which is harmless while no other client uses tokens.

---

## 3. Post-Deployment Verification

### Web Verification
- Open `https://your-app.vercel.app/` in your browser. Verify the home page, responsive layout, and skip link.
- Navigate to `https://your-app.vercel.app/login`. Click **Log in with GitHub** to verify OAuth redirection.
- Test the session endpoint:
  ```sh
  curl https://your-app.vercel.app/api/auth/get-session
  ```
  Expected: `200 OK` with session payload or `null`.

### API Verification
- Test process liveness:
  ```sh
  curl https://your-render-service.onrender.com/health
  ```
  Expected: `{"status":"ok"}`.
- Test token validation: sign in on the web app, request a token from
  `https://your-app.vercel.app/api/auth/token` in the same browser session, then:
  ```sh
  curl -H "Authorization: Bearer <token>" https://your-render-service.onrender.com/me
  ```
  Expected: `{"userId":"..."}`. Without the header, expect `401`. Never paste
  tokens into shared logs or chat.
