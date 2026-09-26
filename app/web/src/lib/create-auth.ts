import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { Pool } from "pg";
import { readAuthConfig } from "./auth-config";
import { createEmailSender, passwordResetEmail, verificationEmail, type SendEmail } from "./email";
import { canUnlink, isUsableSignInMethod } from "./sign-in-methods";

// `sendEmail` lets tests capture messages instead of delivering them.
export function createAuth(env: Record<string, string | undefined>, overrides: { sendEmail?: SendEmail } = {}) {
  const config = readAuthConfig(env);
  const pool = new Pool(config.pool);
  const sendEmail = overrides.sendEmail ?? createEmailSender(config.email);

  const auth = betterAuth({
    appName: "SpecThread",
    database: pool,
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    onAPIError: { errorURL: "/auth/error" },
    rateLimit: { storage: "database" },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendEmail(passwordResetEmail(user.email, url)),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => sendEmail(verificationEmail(user.email, url)),
    },
    socialProviders: {
      github: config.github,
      google: config.google,
    },
    account: {
      encryptOAuthTokens: true,
       // Implicit linking by email still requires both emails to be verified
      // Implicit linking by email still requires both emails to be verified
      // (Better Auth default). Explicit linking from /account may use a
      // different provider email because the user is already signed in. ADR-016.
      accountLinking: { enabled: true, trustedProviders: [], allowDifferentEmails: true },
    },
    databaseHooks: {
      account: {
        delete: {
          // Better Auth only refuses to unlink the last linked account. Also refuse
          // when the remaining accounts use providers disabled in this deployment,
          // which would lock the user out. Scoped to unlinking so Better Auth's own
          // security cleanups are unaffected.
          before: async (account, context) => {
            if (context?.path !== "/unlink-account") return;
            const accounts = (await context.context.internalAdapter.findAccounts(account.userId))
              .map(linked => ({ id: linked.id, usable: isUsableSignInMethod(linked.providerId, config) }));
            if (!canUnlink({ id: account.id, usable: false }, accounts)) {
              throw new APIError("BAD_REQUEST", {
                code: "LAST_USABLE_SIGN_IN_METHOD",
                message: "Keep at least one usable sign-in method.",
              });
            }
          },
        },
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
