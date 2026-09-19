import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { Pool } from "pg";
import { readAuthConfig } from "./auth-config";

const config = readAuthConfig(process.env);

export const auth = betterAuth({
  database: new Pool(config.pool),
  secret: config.secret,
  baseURL: config.baseURL,
  trustedOrigins: config.trustedOrigins,
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      enabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
  },
  plugins: [
    jwt(),
    ...(config.dashboardApiKey ? [dash({ apiKey: config.dashboardApiKey })] : []),
  ],
  advanced: {
    database: {
      validateSchema: false,
    },
  },
});
