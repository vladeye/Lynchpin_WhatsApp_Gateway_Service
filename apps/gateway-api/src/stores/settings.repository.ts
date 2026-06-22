import type { Pool } from "pg";
import type { SettingRow, SettingsRepository } from "./types";

export class PgSettingsRepository implements SettingsRepository {
  constructor(private readonly pool: Pool) {}

  async getAll(): Promise<SettingRow[]> {
    const { rows } = await this.pool.query<SettingRow>(
      "SELECT key, value FROM gateway_settings",
    );
    return rows;
  }

  async get(key: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ value: string }>(
      "SELECT value FROM gateway_settings WHERE key = $1",
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO gateway_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, value],
    );
  }
}
