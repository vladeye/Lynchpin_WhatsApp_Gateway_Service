import type { Pool } from "pg";
import type {
  EventLogDetail,
  EventLogItem,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type {
  DueDelivery,
  EventListFilter,
  WebhookRecord,
  WebhookRepository,
} from "./types";

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/** Builds the shared WHERE clause + params for filtered event queries. */
function buildWhere(filter: EventListFilter): {
  clause: string;
  params: unknown[];
} {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filter.eventType) {
    params.push(filter.eventType);
    conds.push(`event_type = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conds.push(`status = $${params.length}`);
  }
  return {
    clause: conds.length ? `WHERE ${conds.join(" AND ")}` : "",
    params,
  };
}

export class PgWebhookRepository implements WebhookRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: WebhookRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO gateway_webhook_deliveries
         (id, event_type, gateway_account_id, payload, message, status, attempts)
       VALUES ($1, $2, $3, $4, $5, 'pending', 0)`,
      [
        input.id,
        input.event_type,
        input.gateway_account_id,
        JSON.stringify(input.payload ?? null),
        input.message,
      ],
    );
  }

  async updateStatus(
    id: string,
    status: string,
    attempts: number,
    lastError: string | null,
    delivered: boolean,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE gateway_webhook_deliveries
         SET status = $2, attempts = $3, last_error = $4,
             delivered_at = CASE WHEN $5 THEN now() ELSE delivered_at END
       WHERE id = $1`,
      [id, status, attempts, lastError, delivered],
    );
  }

  async claimDue(limit: number): Promise<DueDelivery[]> {
    // Single in-process worker with non-overlapping ticks, so a plain due-query
    // is safe. SKIP LOCKED guards the unlikely overlap; a leased claim would be
    // needed only for multiple gateway instances (future).
    const { rows } = await this.pool.query<DueDelivery>(
      `SELECT id, event_type, gateway_account_id, payload, attempts,
              to_char(created_at, ${ISO}) AS created_at
         FROM gateway_webhook_deliveries
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    return rows;
  }

  async markDelivered(id: string, attempts: number): Promise<void> {
    await this.pool.query(
      `UPDATE gateway_webhook_deliveries
          SET status = 'delivered', attempts = $2, last_error = NULL,
              delivered_at = now()
        WHERE id = $1`,
      [id, attempts],
    );
  }

  async reschedule(
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    lastError: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE gateway_webhook_deliveries
          SET status = 'pending', attempts = $2, last_error = $3,
              next_attempt_at = $4
        WHERE id = $1`,
      [id, attempts, lastError, nextAttemptAt],
    );
  }

  async markDead(
    id: string,
    attempts: number,
    lastError: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE gateway_webhook_deliveries
          SET status = 'dead', attempts = $2, last_error = $3
        WHERE id = $1`,
      [id, attempts, lastError],
    );
  }

  async markSkipped(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE gateway_webhook_deliveries SET status = 'skipped' WHERE id = $1`,
      [id],
    );
  }

  async redeliver(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE gateway_webhook_deliveries
          SET status = 'pending', attempts = 0, last_error = NULL,
              delivered_at = NULL, next_attempt_at = now()
        WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async listRecent(limit: number): Promise<EventLogItem[]> {
    return this.list({ limit, offset: 0 });
  }

  async list(filter: EventListFilter): Promise<EventLogItem[]> {
    const { clause, params } = buildWhere(filter);
    params.push(filter.limit);
    const limitIdx = params.length;
    params.push(filter.offset);
    const offsetIdx = params.length;
    const { rows } = await this.pool.query<EventLogItem>(
      `SELECT id, event_type, gateway_account_id, status, attempts, message,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM gateway_webhook_deliveries
         ${clause}
        ORDER BY created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );
    return rows;
  }

  async count(filter: EventListFilter): Promise<number> {
    const { clause, params } = buildWhere(filter);
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM gateway_webhook_deliveries ${clause}`,
      params,
    );
    return Number(rows[0]?.n ?? 0);
  }

  async getById(id: string): Promise<EventLogDetail | null> {
    const { rows } = await this.pool.query<EventLogDetail>(
      `SELECT id, event_type, gateway_account_id, status, attempts, message,
              payload, last_error, target_url,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
              to_char(delivered_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS delivered_at
         FROM gateway_webhook_deliveries WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async distinctEventTypes(): Promise<string[]> {
    const { rows } = await this.pool.query<{ event_type: string }>(
      `SELECT DISTINCT event_type FROM gateway_webhook_deliveries
        ORDER BY event_type`,
    );
    return rows.map((r) => r.event_type);
  }
}
