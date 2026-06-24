import type {
  ChatMessage,
  ChatSummary,
  EventLogDetail,
  EventLogItem,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type {
  AccountRecord,
  AccountRepository,
  AccountUpdate,
  AdminRecord,
  AdminRepository,
  CapturedMessageRow,
  CreateAccountRecord,
  EventListFilter,
  MediaRef,
  MessageRepository,
  OutboundMessageRow,
  SettingRow,
  SettingsRepository,
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
      self_lid: null,
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
  media_path: string | null;
  media_mime: string | null;
  media_filename: string | null;
  created_at: string;
}

export class InMemoryMessageRepository implements MessageRepository {
  readonly captured: StoredMessage[] = [];
  readonly outbound = new Map<string, OutboundMessageRow>();
  private readonly all: StoredMessage[] = [];
  private readonly seen = new Set<string>();

  async capture(row: CapturedMessageRow): Promise<boolean> {
    const key = `${row.gateway_account_id}:${row.wa_message_id}`;
    if (row.wa_message_id && this.seen.has(key)) return false;
    if (row.wa_message_id) this.seen.add(key);
    const stored: StoredMessage = {
      id: row.id,
      gateway_account_id: row.gateway_account_id,
      chat_id: row.chat_id,
      direction: row.direction,
      type: row.type,
      body: row.body,
      media_path: row.media_path ?? null,
      media_mime: row.media_mime ?? null,
      media_filename: row.media_filename ?? null,
      created_at: new Date().toISOString(),
    };
    this.captured.push(stored);
    this.all.push(stored);
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
      media_path: row.media_path ?? null,
      media_mime: row.media_mime ?? null,
      media_filename: row.media_filename ?? null,
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

  async getMediaRef(
    accountId: string,
    messageId: string,
  ): Promise<MediaRef | null> {
    const m = this.all.find(
      (x) =>
        x.gateway_account_id === accountId &&
        x.id === messageId &&
        x.media_path,
    );
    if (!m || !m.media_path) return null;
    return {
      media_path: m.media_path,
      media_mime: m.media_mime,
      media_filename: m.media_filename,
    };
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
        is_self: false,
        last_body: m.body,
        last_type: m.type,
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
        media_mime: m.media_mime,
        media_filename: m.media_filename,
        created_at: m.created_at,
      }));
  }
}

interface StoredWebhook extends WebhookRecord {
  status: string;
  attempts: number;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export class InMemoryWebhookRepository implements WebhookRepository {
  readonly records: StoredWebhook[] = [];

  async record(input: WebhookRecord): Promise<void> {
    this.records.push({
      ...input,
      status: "pending",
      attempts: 0,
      last_error: null,
      delivered_at: null,
      created_at: new Date().toISOString(),
    });
  }

  async updateStatus(
    id: string,
    status: string,
    attempts: number,
    lastError: string | null = null,
    delivered = false,
  ): Promise<void> {
    const rec = this.records.find((r) => r.id === id);
    if (rec) {
      rec.status = status;
      rec.attempts = attempts;
      rec.last_error = lastError;
      if (delivered) rec.delivered_at = new Date().toISOString();
    }
  }

  private toItem(r: StoredWebhook): EventLogItem {
    return {
      id: r.id,
      event_type: r.event_type,
      gateway_account_id: r.gateway_account_id,
      status: r.status,
      attempts: r.attempts,
      message: r.message,
      created_at: r.created_at,
    };
  }

  private match(r: StoredWebhook, filter: EventListFilter): boolean {
    if (filter.eventType && r.event_type !== filter.eventType) return false;
    if (filter.status && r.status !== filter.status) return false;
    return true;
  }

  async listRecent(limit: number): Promise<EventLogItem[]> {
    return this.list({ limit, offset: 0 });
  }

  async list(filter: EventListFilter): Promise<EventLogItem[]> {
    return this.records
      .filter((r) => this.match(r, filter))
      .reverse()
      .slice(filter.offset, filter.offset + filter.limit)
      .map((r) => this.toItem(r));
  }

  async count(filter: EventListFilter): Promise<number> {
    return this.records.filter((r) => this.match(r, filter)).length;
  }

  async getById(id: string): Promise<EventLogDetail | null> {
    const r = this.records.find((x) => x.id === id);
    if (!r) return null;
    return {
      ...this.toItem(r),
      payload: r.payload,
      last_error: r.last_error,
      target_url: null,
      delivered_at: r.delivered_at,
    };
  }

  async distinctEventTypes(): Promise<string[]> {
    return [...new Set(this.records.map((r) => r.event_type))].sort();
  }
}

export class InMemoryAdminRepository implements AdminRepository {
  private readonly byUsername = new Map<string, AdminRecord>();

  async getByUsername(username: string): Promise<AdminRecord | null> {
    const rec = this.byUsername.get(username);
    return rec ? { ...rec } : null;
  }

  async create(input: {
    id: string;
    username: string;
    password_hash: string;
  }): Promise<AdminRecord> {
    const now = new Date().toISOString();
    const rec: AdminRecord = { ...input, created_at: now, updated_at: now };
    this.byUsername.set(rec.username, rec);
    return { ...rec };
  }

  async updatePassword(username: string, passwordHash: string): Promise<void> {
    const rec = this.byUsername.get(username);
    if (rec) {
      rec.password_hash = passwordHash;
      rec.updated_at = new Date().toISOString();
    }
  }

  async count(): Promise<number> {
    return this.byUsername.size;
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  private readonly store = new Map<string, string>();

  async getAll(): Promise<SettingRow[]> {
    return [...this.store.entries()].map(([key, value]) => ({ key, value }));
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}
