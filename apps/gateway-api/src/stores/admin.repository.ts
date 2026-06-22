import type { Pool } from "pg";
import type { AdminRecord, AdminRepository } from "./types";

export class PgAdminRepository implements AdminRepository {
  constructor(private readonly pool: Pool) {}

  async getByUsername(username: string): Promise<AdminRecord | null> {
    const { rows } = await this.pool.query<AdminRecord>(
      `SELECT id, username, password_hash,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
         FROM gateway_admins WHERE username = $1`,
      [username],
    );
    return rows[0] ?? null;
  }

  async create(input: {
    id: string;
    username: string;
    password_hash: string;
  }): Promise<AdminRecord> {
    const { rows } = await this.pool.query<AdminRecord>(
      `INSERT INTO gateway_admins (id, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, password_hash,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                 to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`,
      [input.id, input.username, input.password_hash],
    );
    return rows[0]!;
  }

  async updatePassword(username: string, passwordHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE gateway_admins
         SET password_hash = $2, updated_at = now()
       WHERE username = $1`,
      [username, passwordHash],
    );
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM gateway_admins",
    );
    return Number(rows[0]?.n ?? 0);
  }
}
