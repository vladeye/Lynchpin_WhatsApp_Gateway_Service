import type { Pool } from "pg";
import type {
  ChatMessage,
  ChatSummary,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type {
  CapturedMessageRow,
  MessageRepository,
  OutboundMessageRow,
} from "./types";

export class PgMessageRepository implements MessageRepository {
  constructor(private readonly pool: Pool) {}

  async capture(row: CapturedMessageRow): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO gateway_messages
         (id, gateway_account_id, wa_message_id, chat_id, direction, type, body, status, normalized_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               CASE WHEN $5 = 'inbound' THEN 'received' ELSE 'sent' END, $8)
       ON CONFLICT (gateway_account_id, wa_message_id) WHERE wa_message_id IS NOT NULL
       DO NOTHING`,
      [
        row.id,
        row.gateway_account_id,
        row.wa_message_id,
        row.chat_id,
        row.direction,
        row.type,
        row.body,
        JSON.stringify(row.normalized_payload ?? null),
      ],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async insertOutbound(row: OutboundMessageRow): Promise<{ duplicate: boolean }> {
    const res = await this.pool.query(
      `INSERT INTO gateway_messages
         (id, gateway_account_id, wa_message_id, chat_id, direction, type, body, status, request_id)
       VALUES ($1, $2, $3, $4, 'outbound', $5, $6, 'sent', $7)
       ON CONFLICT (request_id) WHERE request_id IS NOT NULL
       DO NOTHING`,
      [
        row.id,
        row.gateway_account_id,
        row.wa_message_id,
        row.chat_id,
        row.type,
        row.body,
        row.request_id,
      ],
    );
    return { duplicate: (res.rowCount ?? 0) === 0 };
  }

  async getByRequestId(requestId: string): Promise<OutboundMessageRow | null> {
    const { rows } = await this.pool.query<OutboundMessageRow>(
      `SELECT id, gateway_account_id, request_id, chat_id, type, body, wa_message_id
         FROM gateway_messages WHERE request_id = $1`,
      [requestId],
    );
    return rows[0] ?? null;
  }

  async setOutboundWaId(requestId: string, waMessageId: string): Promise<void> {
    // Tolerate the rare case where the fromMe echo captured this wa_message_id
    // first (unique index); leaving the request row's wa_message_id null is fine.
    try {
      await this.pool.query(
        "UPDATE gateway_messages SET wa_message_id = $2 WHERE request_id = $1",
        [requestId, waMessageId],
      );
    } catch {
      // ignore unique-violation race
    }
  }

  async listChats(accountId: string, limit: number): Promise<ChatSummary[]> {
    const { rows } = await this.pool.query<ChatSummary>(
      `SELECT
         t.chat_id,
         names.contact_name,
         (t.chat_id = a.self_lid
            OR (a.phone_number IS NOT NULL
                AND t.chat_id = a.phone_number || '@s.whatsapp.net')) AS is_self,
         t.last_body,
         t.last_direction,
         t.last_at
       FROM (
         SELECT DISTINCT ON (chat_id)
           chat_id,
           body AS last_body,
           direction AS last_direction,
           to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_at,
           created_at
         FROM gateway_messages
         WHERE gateway_account_id = $1
         ORDER BY chat_id, created_at DESC
       ) t
       JOIN gateway_accounts a ON a.id = $1
       LEFT JOIN LATERAL (
         SELECT m.normalized_payload->'payload'->'conversation'->>'contact_name'
                  AS contact_name
         FROM gateway_messages m
         WHERE m.gateway_account_id = $1
           AND m.chat_id = t.chat_id
           AND m.direction = 'inbound'
           AND m.normalized_payload->'payload'->'conversation'->>'contact_name'
                 IS NOT NULL
         ORDER BY m.created_at DESC
         LIMIT 1
       ) names ON true
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [accountId, limit],
    );
    return rows;
  }

  async listMessages(
    accountId: string,
    chatId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    const { rows } = await this.pool.query<ChatMessage>(
      `SELECT id, direction, type, body,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM gateway_messages
        WHERE gateway_account_id = $1 AND chat_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [accountId, chatId, limit],
    );
    return rows;
  }
}
