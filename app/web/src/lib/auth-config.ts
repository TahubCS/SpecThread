import type { PoolConfig } from "pg";
import { X509Certificate } from "node:crypto";

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Configure ${name} before starting Better Auth.`);
  return value;
}

/**
 * Reads and validates the environment settings required to configure Better Auth.
 */
export function readAuthConfig(env: Environment) {
  const secret = required(env, "BETTER_AUTH_SECRET");
  if (secret.length < 32 || secret === "development-secret-key-must-be-at-least-32-chars-long") {
    throw new Error("BETTER_AUTH_SECRET must be a new random secret of at least 32 characters.");
  }
  const baseURL = required(env, "BETTER_AUTH_URL");
  let origin: URL;
  try { origin = new URL(baseURL); } catch { throw new Error("BETTER_AUTH_URL must be an exact HTTP(S) origin."); }
  const loopback = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
      origin.hostname.includes("*") ||
      !(origin.protocol === "https:" || (origin.protocol === "http:" && loopback(origin.hostname)))) {
    throw new Error("BETTER_AUTH_URL must be an exact HTTPS origin (HTTP is allowed only on loopback).");
  }

  const connectionString = env.DATABASE_URL?.trim() || required(env, "BETTER_AUTH_DATABASE_URL");
  let database: URL;
  try { database = new URL(connectionString); } catch { throw new Error("Configure a valid PostgreSQL DATABASE_URL."); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.hash) {
    throw new Error("Configure a valid PostgreSQL DATABASE_URL.");
  }
  // pg lets URL parameters replace explicit TLS options. Accept legacy secure
  // sslmode spellings, then remove them so certificate verification stays enabled.
  for (const [key, value] of database.searchParams) {
    if (key !== "sslmode" || !["require", "verify-full"].includes(value)) {
      throw new Error("DATABASE_URL supports only sslmode=require or verify-full; configure CA trust with DATABASE_CA_CERT.");
    }
  }
  database.search = "";
  const ca = env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  if (ca) {
    const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
    try {
      if (!certificates.length || ca.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, "").trim()) {
        throw new Error("Incomplete PEM");
      }
      for (const certificate of certificates) new X509Certificate(certificate);
    } catch {
      throw new Error("DATABASE_CA_CERT must contain complete PEM certificate contents with preserved newlines, not a file path.");
    }
  }
  const clientId = env.GITHUB_CLIENT_ID?.trim() || "";
  const clientSecret = env.GITHUB_CLIENT_SECRET?.trim() || "";
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error("Configure both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or leave both empty to disable GitHub sign-in.");
  }
  const pool: PoolConfig = {
    connectionString: database.toString(),
    ssl: loopback(database.hostname) ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
  return {
    secret, baseURL: origin.origin, trustedOrigins: [origin.origin], pool,
    ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
    github: { clientId, clientSecret, enabled: Boolean(clientId && clientSecret) },
    dashboardApiKey: env.BETTER_AUTH_API_KEY?.trim() || undefined,
    email: readEmailConfig(env, loopback(origin.hostname)),
    github: readProvider(env, "GITHUB"),
    google: readProvider(env, "GOOGLE"),
  };
}

export type EmailConfig =
  | { delivery: "resend"; apiKey: string; from: string }
  | { delivery: "log" };

// Verification and reset links carry tokens, so logging them is allowed only for
// a loopback BETTER_AUTH_URL (local development and tests). See ADR-016.
function readEmailConfig(env: Environment, loopbackOrigin: boolean): EmailConfig {
  const delivery = env.EMAIL_DELIVERY?.trim() || "resend";
  if (delivery === "log") {
    if (!loopbackOrigin) throw new Error("EMAIL_DELIVERY=log is allowed only when BETTER_AUTH_URL is a loopback origin.");
    return { delivery };
  }
  if (delivery !== "resend") throw new Error("EMAIL_DELIVERY must be resend or log.");
  return { delivery, apiKey: required(env, "RESEND_API_KEY"), from: required(env, "EMAIL_FROM") };
}

// A social provider is enabled only when both its client ID and secret are set.
function readProvider(env: Environment, prefix: "GITHUB" | "GOOGLE") {
  const clientId = env[`${prefix}_CLIENT_ID`]?.trim() || "";
  const clientSecret = env[`${prefix}_CLIENT_SECRET`]?.trim() || "";
  return { clientId, clientSecret, enabled: Boolean(clientId && clientSecret) };
}
