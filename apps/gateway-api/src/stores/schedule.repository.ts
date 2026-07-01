import type { Pool } from "pg";
import type { ReadingSchedule, ScheduleRepository } from "./types";

export class PgScheduleRepository implements ScheduleRepository {
  constructor(private readonly pool: Pool) {}

  async get(accountId: string): Promise<ReadingSchedule | null> {
    const { rows } = await this.pool.query<{ schedule: ReadingSchedule }>(
      `SELECT schedule FROM gateway_reading_schedules WHERE account_id = $1`,
      [accountId],
    );
    return rows[0]?.schedule ?? null;
  }

  async upsert(accountId: string, schedule: ReadingSchedule): Promise<void> {
    await this.pool.query(
      `INSERT INTO gateway_reading_schedules (account_id, schedule)
       VALUES ($1, $2)
       ON CONFLICT (account_id)
       DO UPDATE SET schedule = EXCLUDED.schedule, updated_at = now()`,
      [accountId, JSON.stringify(schedule)],
    );
  }

  async all(): Promise<Map<string, ReadingSchedule>> {
    const { rows } = await this.pool.query<{
      account_id: string;
      schedule: ReadingSchedule;
    }>(`SELECT account_id, schedule FROM gateway_reading_schedules`);
    return new Map(rows.map((r) => [r.account_id, r.schedule]));
  }
}
