import type {
  ChatMessage,
  ChatSummary,
  EventLogItem,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type {
  AccountRecord,
  AccountRepository,
  AccountUpdate,
  CreateAccountRecord,
  InboundMessageRow,
  MessageRepository,
  OutboundMessageRow,
  WebhookRecord,
  WebhookRepository,
} from "./types";

/** In-memory repositories used by unit tests (no Postgres). */
export class InMemoryAccountRepository implements AccountRepository {
  private readonly byId = new Map<string, AccountRecord>();

  async create(input: CreateAccountRecord): Promise<AccountRecord> {
    const now = new Date().toISOString();
    const rec: AccountRecord = {
      id: input.id,
      external_account_id: input.external_account_id,
      name: input.name,
      state: "created",
      phone_number: null,
      display_name: null,
      session_path: input.session_path,
      last_qr: null,
      last_error: null,
      created_at: now,
      updated_at: now,
      last_connected_at: null,
      last_disconnected_at: null,
      logged_out_at: null,
    };
    this.byId.set(rec.id, rec);
    return { ...rec };
  }

  async getById(id: string): Promise<AccountRecord | null> {
    const rec = this.byId.get(id);
    return rec ? { ...rec } : null;
  }

  async getByExternalId(externalId: string): Promise<AccountRecord | null> {
    for (const rec of this.byId.values()) {
      if (rec.external_account_id === externalId) return { ...rec };
    }
    return null;
  }

  async list(): Promise<AccountRecord[]> {
    return [...this.byId.values()].map((r) => ({ ...r }));
  }

  async update(id: string, patch: AccountUpdate): Promise<AccountRecord | null> {
    const rec = this.byId.get(id);
    if (!rec) return null;
    Object.assign(rec, patch, { updated_at: new Date().toISOString() });
    return { ...rec };
  }

  async delete(id: string): Promise<boolean> {
    return this.byId.delete(id);
  }
}

interface StoredMessage {
  id: string;
  gateway_account_id: string;
  chat_id: string;
  direction: string;
  type: string;
  body: string | null;
  created_at: string;
}

export class InMemoryMessageRepository implements MessageRepository {
  readonly inbound: InboundMessageRow[] = [];
  readonly outbound = new Map<string, OutboundMessageRow>();
  private readonly all: StoredMessage[] = [];
  private readonly seen = new Set<string>();

  async insertInbound(row: InboundMessageRow): Promise<boolean> {
    const key = `${row.gateway_account_id}:${row.wa_message_id}`;
    if (row.wa_message_id && this.seen.has(key)) return false;
    if (row.wa_message_id) this.seen.add(key);
    this.inbound.push(row);
    this.all.push({
      id: row.id,
      gateway_account_id: row.gateway_account_id,
      chat_id: row.chat_id,
      direction: "inbound",
      type: row.type,
      body: row.body,
      created_at: new Date().toISOString(),
    });
    return true;
  }

  async insertOutbound(row: OutboundMessageRow): Promise<{ duplicate: boolean }> {
    if (this.outbound.has(row.request_id)) return { duplicate: true };
    this.outbound.set(row.request_id, row);
    this.all.push({
      id: row.id,
      gateway_account_id: row.gateway_account_id,
      chat_id: row.chat_id,
      direction: "outbound",
      type: row.type,
      body: row.body,
      created_at: new Date().toISOString(),
    });
    return { duplicate: false };
  }

  async getByRequestId(requestId: string): Promise<OutboundMessageRow | null> {
    return this.outbound.get(requestId) ?? null;
  }

  async setOutboundWaId(requestId: string, waMessageId: string): Promise<void> {
    const row = this.outbound.get(requestId);
    if (row) row.wa_message_id = waMessageId;
  }

  async listChats(accountId: string, limit: number): Promise<ChatSummary[]> {
    const byChat = new Map<string, StoredMessage>();
    for (const m of this.all) {
      if (m.gateway_account_id !== accountId) continue;
      byChat.set(m.chat_id, m); // last one wins (array is chronological)
    }
    return [...byChat.values()]
      .reverse()
      .slice(0, limit)
      .map((m) => ({
        chat_id: m.chat_id,
        contact_name: null,
        last_body: m.body,
        last_direction: m.direction,
        last_at: m.created_at,
      }));
  }

  async listMessages(
    accountId: string,
    chatId: string,
    limit: number,
  ): Promise<ChatMessage[]> {
    return this.all
      .filter(
        (m) => m.gateway_account_id === accountId && m.chat_id === chatId,
      )
      .slice(0, limit)
      .map((m) => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        body: m.body,
        created_at: m.created_at,
      }));
  }
}

export class InMemoryWebhookRepository implements WebhookRepository {
  readonly records: (WebhookRecord & { status: string; attempts: number })[] = [];

  async record(input: WebhookRecord): Promise<void> {
    this.records.push({ ...input, status: "pending", attempts: 0 });
  }

  async updateStatus(
    id: string,
    status: string,
    attempts: number,
  ): Promise<void> {
    const rec = this.records.find((r) => r.id === id);
    if (rec) {
      rec.status = status;
      rec.attempts = attempts;
    }
  }

  async listRecent(limit: number): Promise<EventLogItem[]> {
    return this.records
      .slice(-limit)
      .reverse()
      .map((r) => ({
        id: r.id,
        event_type: r.event_type,
        gateway_account_id: r.gateway_account_id,
        status: r.status,
        attempts: r.attempts,
        message: r.message,
        created_at: new Date().toISOString(),
      }));
  }
}
