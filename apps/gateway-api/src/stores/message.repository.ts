import type { Pool } from "pg";
import type {
  ChatMessage,
  ChatSummary,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type {
  InboundMessageRow,
  MessageRepository,
  OutboundMessageRow,
} from "./types";

export class PgMessageRepository implements MessageRepository {
  constructor(private readonly pool: Pool) {}

  async insertInbound(row: InboundMessageRow): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO gateway_messages
         (id, gateway_account_id, wa_message_id, chat_id, direction, type, body, status, normalized_payload)
       VALUES ($1, $2, $3, $4, 'inbound', $5, $6, 'received', $7)
       ON CONFLICT (gateway_account_id, wa_message_id) WHERE wa_message_id IS NOT NULL
       DO NOTHING`,
      [
        row.id,
        row.gateway_account_id,
        row.wa_message_id,
        row.chat_id,
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
    await this.pool.query(
      "UPDATE gateway_messages SET wa_message_id = $2 WHERE request_id = $1",
      [requestId, waMessageId],
    );
  }

  async listChats(accountId: string, limit: number): Promise<ChatSummary[]> {
    const { rows } = await this.pool.query<ChatSummary>(
      `SELECT chat_id, contact_name, last_body, last_direction, last_at FROM (
         SELECT DISTINCT ON (chat_id)
           chat_id,
           body AS last_body,
           direction AS last_direction,
           normalized_payload->'payload'->'conversation'->>'contact_name' AS contact_name,
           to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_at,
           created_at
         FROM gateway_messages
         WHERE gateway_account_id = $1
         ORDER BY chat_id, created_at DESC
       ) t
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
