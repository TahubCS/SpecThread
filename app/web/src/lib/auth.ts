import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.BETTER_AUTH_DATABASE_URL ||
  "postgres://postgres:postgres@127.0.0.1:5432/postgres";

const isRemote =
  connectionString.includes("supabase.com") ||
  connectionString.includes("sslmode=require") ||
  process.env.DATABASE_SSL === "true";

export const auth = betterAuth({
  database: new Pool({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  }),
  secret: process.env.BETTER_AUTH_SECRET || "development-secret-key-must-be-at-least-32-chars-long",
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://*.ngrok-free.app",
    "https://*.ngrok-free.dev",
    "https://*.ngrok.io",
    "https://*.ngrok.app",
  ],
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      enabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
  },
  plugins: [
    jwt(),
    dash({
      apiKey: process.env.BETTER_AUTH_API_KEY || "ba_q3svn5naq5tbxqdl1xwct5u30pacsyd1",
    }),
  ],
  advanced: {
    database: {
      validateSchema: false,
    },
  },
});
