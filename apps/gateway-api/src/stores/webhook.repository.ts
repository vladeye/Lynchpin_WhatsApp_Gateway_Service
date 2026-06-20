import type { Pool } from "pg";
import type { EventLogItem } from "@lynchpin-whatsapp-gateway/shared-types";
import type { WebhookRecord, WebhookRepository } from "./types";

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
    const { rows } = await this.pool.query<EventLogItem>(
      `SELECT id, event_type, gateway_account_id, status, attempts, message,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM gateway_webhook_deliveries
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows;
  }
}
