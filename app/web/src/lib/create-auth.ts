import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { Pool } from "pg";
import { readAuthConfig } from "./auth-config";

/**
 * Creates a Better Auth instance and its PostgreSQL connection pool from environment settings.
 */
export function createAuth(env: Record<string, string | undefined>) {
  const config = readAuthConfig(env);
  const pool = new Pool(config.pool);

  const auth = betterAuth({
    appName: "SpecThread",
    database: pool,
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    onAPIError: { errorURL: "/auth/error" },
    rateLimit: { storage: "database" },
    account: { encryptOAuthTokens: true },
    socialProviders: {
      github: config.github,
    },
    plugins: [
      jwt(),
      ...(config.dashboardApiKey ? [dash({ apiKey: config.dashboardApiKey })] : []),
    ],
    advanced: {
      ipAddress: {
        ipAddressHeaders: config.ipAddressHeaders,
      },
      database: {
        validateSchema: false,
        joins: true,
      },
    },
  });

  return { auth, pool };
}
