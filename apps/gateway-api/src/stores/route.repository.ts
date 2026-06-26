import type { Pool } from "pg";
import type {
  ConversationRoute,
  RouteStatus,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type { RouteRepository } from "./types";

const COLUMNS = `gateway_account_id, chat_id, owner, status,
  to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at`;

export class PgRouteRepository implements RouteRepository {
  constructor(private readonly pool: Pool) {}

  async getRoute(
    gatewayAccountId: string,
    chatId: string,
  ): Promise<ConversationRoute | null> {
    const { rows } = await this.pool.query<ConversationRoute>(
      `SELECT ${COLUMNS} FROM gateway_conversation_routes
        WHERE gateway_account_id = $1 AND chat_id = $2`,
      [gatewayAccountId, chatId],
    );
    return rows[0] ?? null;
  }

  async setRoute(
    gatewayAccountId: string,
    chatId: string,
    owner: string,
    status: RouteStatus,
  ): Promise<ConversationRoute> {
    const { rows } = await this.pool.query<ConversationRoute>(
      `INSERT INTO gateway_conversation_routes (gateway_account_id, chat_id, owner, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (gateway_account_id, chat_id)
       DO UPDATE SET owner = EXCLUDED.owner, status = EXCLUDED.status, updated_at = now()
       RETURNING ${COLUMNS}`,
      [gatewayAccountId, chatId, owner, status],
    );
    return rows[0]!;
  }
}
