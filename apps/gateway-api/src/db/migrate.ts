import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/db -> apps/gateway-api/migrations
  return path.resolve(here, "../../migrations");
}

/**
 * Apply pending SQL migrations in filename order, tracked in schema_migrations.
 * Idempotent: already-applied files are skipped.
 */
export async function runMigrations(
  pool: Pool,
  dir: string = migrationsDir(),
): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations",
  );
  const applied = new Set(rows.map((r) => r.name));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      ran.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return ran;
}
