import type { Pool } from "pg";
import type {
  EventLogDetail,
  EventLogItem,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type {
  EventListFilter,
  WebhookRecord,
  WebhookRepository,
} from "./types";

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
