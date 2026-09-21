import type { Pool } from "pg";
export function startTestDatabase(): Promise<{
  name: string;
  connectionString: string;
  pool: Pool;
  stop(): Promise<void>;
}>;
