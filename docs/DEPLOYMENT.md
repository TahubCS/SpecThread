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
| `BETTER_AUTH_SECRET` | 32+ character random secret for signing tokens | Generate via `openssl rand -hex 16` |
| `BETTER_AUTH_URL` | Canonical public URL of your Vercel deployment | `https://your-app.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | Public frontend URL | `https://your-app.vercel.app` |
| `DATABASE_URL` | Supabase connection string for Better Auth auth tables | `postgres://postgres.[ref]:[pass]@[host]:5432/postgres?sslmode=require` |
| `GITHUB_CLIENT_ID` | Client ID from your GitHub OAuth App | `Ov23li...` |
| `GITHUB_CLIENT_SECRET` | Client Secret from your GitHub OAuth App | `<secret>` |
| `BETTER_AUTH_API_KEY` | (Optional) Better Auth Dashboard API key | `ba_...` |

5. Click **Deploy**.

### GitHub OAuth Configuration
In your GitHub Developer Settings (OAuth Apps):
* **Homepage URL**: `https://your-app.vercel.app`
* **Authorization callback URL**: `https://your-app.vercel.app/api/auth/callback/github`

---

## 2. API Deployment (Render)

The ASP.NET Core Web API is packaged as an unprivileged, multi-stage Linux container using the official Microsoft .NET 10 runtime images.

### Method A: Using the Render Blueprint (`render.yaml`)
1. In the Render Dashboard, click **New > Blueprint**.
2. Connect the **SpecThread** repository.
3. Render will detect [`render.yaml`](../render.yaml) and configure the `specthread-api` web service automatically.
4. Enter the required secret value for `ConnectionStrings__Database`.
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
     * `ConnectionStrings__Database`: Your Supabase Npgsql connection string (e.g. `Host=...;Port=5432;Database=postgres;Username=...;Password=...;SSL Mode=Require;`)
5. Click **Deploy Web Service**.

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
