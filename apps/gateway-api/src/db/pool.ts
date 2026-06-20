import { Pool } from "pg";

let pool: Pool | undefined;

/** Lazily create the shared pg Pool from DATABASE_URL. */
export function getPool(databaseUrl?: string): Pool {
  if (!pool) {
    const connectionString = databaseUrl ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
