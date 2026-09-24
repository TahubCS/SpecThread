import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { Pool } from "pg";
import { readAuthConfig } from "./auth-config";

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
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID || "",
        clientSecret: env.GITHUB_CLIENT_SECRET || "",
        enabled: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      },
    },
    plugins: [
      // ES256 so the ASP.NET API can validate tokens natively (ADR-015).
      jwt({ jwks: { keyPairConfig: { alg: "ES256" } } }),
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
