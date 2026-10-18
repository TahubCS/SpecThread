import { createAuth } from "./create-auth";

// One auth instance, and so one database pool, per server process. The page gate and the pages
// are bundled separately, and in development every code reload evaluates this module again;
// without this each copy would open its own connections until the database refuses more.
// A change to the auth setup therefore needs a restart of the dev server to take effect.
const shared = globalThis as typeof globalThis & { __specthreadAuth?: ReturnType<typeof createAuth> };

export const { auth } = (shared.__specthreadAuth ??= createAuth(process.env));
