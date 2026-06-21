import type { Pool } from "pg";
import type {
  AccountRecord,
  AccountRepository,
  AccountUpdate,
  CreateAccountRecord,
} from "./types";

const COLUMNS = `id, external_account_id, name, state, phone_number, display_name,
  session_path, self_lid, last_qr, last_error,
  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
  to_char(last_connected_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_connected_at,
  to_char(last_disconnected_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_disconnected_at,
  to_char(logged_out_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS logged_out_at`;

export class PgAccountRepository implements AccountRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateAccountRecord): Promise<AccountRecord> {
    const { rows } = await this.pool.query<AccountRecord>(
      `INSERT INTO gateway_accounts (id, external_account_id, name, state, session_path)
       VALUES ($1, $2, $3, 'created', $4)
       RETURNING ${COLUMNS}`,
      [input.id, input.external_account_id, input.name, input.session_path],
    );
    return rows[0]!;
  }

  async getById(id: string): Promise<AccountRecord | null> {
    const { rows } = await this.pool.query<AccountRecord>(
      `SELECT ${COLUMNS} FROM gateway_accounts WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async getByExternalId(externalId: string): Promise<AccountRecord | null> {
    const { rows } = await this.pool.query<AccountRecord>(
      `SELECT ${COLUMNS} FROM gateway_accounts WHERE external_account_id = $1`,
      [externalId],
    );
    return rows[0] ?? null;
  }

  async list(): Promise<AccountRecord[]> {
    const { rows } = await this.pool.query<AccountRecord>(
      `SELECT ${COLUMNS} FROM gateway_accounts ORDER BY created_at ASC`,
    );
    return rows;
  }

  async update(id: string, patch: AccountUpdate): Promise<AccountRecord | null> {
    const keys = Object.keys(patch) as (keyof AccountUpdate)[];
    if (keys.length === 0) return this.getById(id);

    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    const values = keys.map((k) => patch[k] ?? null);
    const { rows } = await this.pool.query<AccountRecord>(
      `UPDATE gateway_accounts
         SET ${sets.join(", ")}, updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, ...values],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.pool.query(
      "DELETE FROM gateway_accounts WHERE id = $1",
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
