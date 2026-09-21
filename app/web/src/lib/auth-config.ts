import type { PoolConfig } from "pg";

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Configure ${name} before starting Better Auth.`);
  return value;
}

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
  const pool: PoolConfig = {
    connectionString: database.toString(),
    ssl: loopback(database.hostname) ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
  return {
    secret, baseURL: origin.origin, trustedOrigins: [origin.origin], pool,
    ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
    dashboardApiKey: env.BETTER_AUTH_API_KEY?.trim() || undefined,
  };
}
