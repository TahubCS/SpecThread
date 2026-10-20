import type { Pool, PoolClient } from "pg";

/**
 * Holds the row lock of a project's team in a test transaction, the way a concurrent team write
 * does, and runs `during` while it is held. `during` may run SQL inside the same transaction, for
 * example to archive the project, through `client`. The transaction commits after `during`,
 * releasing the lock, and rolls back if `during` throws.
 */
export async function withTeamLock<T>(pool: Pool, projectId: string, during: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT 1 FROM public.teams WHERE id = (SELECT team_id FROM public.projects WHERE id = $1) FOR UPDATE", [projectId]);
    const result = await during(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Reports whether `pending` is still unsettled after `ms`, meaning the request is waiting on a lock. */
export async function stillWaiting(pending: Promise<unknown>, ms = 500) {
  const waiting = Symbol("waiting");
  const settled = await Promise.race([
    pending.then(() => null, () => null),
    new Promise(resolve => setTimeout(() => resolve(waiting), ms)),
  ]);
  return settled === waiting;
}
