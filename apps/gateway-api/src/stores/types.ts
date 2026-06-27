import type {
  AccountState,
  ChatMessage,
  ChatSummary,
  ConversationRoute,
  EventLogDetail,
  EventLogItem,
  RouteStatus,
} from "@lynchpin-whatsapp-gateway/shared-types";

export interface AccountRecord {
  id: string;
  external_account_id: string;
  name: string;
  state: AccountState;
  phone_number: string | null;
  display_name: string | null;
  session_path: string;
  self_lid: string | null;
  last_qr: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  logged_out_at: string | null;
}

export type AccountUpdate = Partial<
  Pick<
    AccountRecord,
    | "state"
    | "phone_number"
    | "display_name"
    | "self_lid"
    | "last_qr"
    | "last_error"
    | "last_connected_at"
    | "last_disconnected_at"
    | "logged_out_at"
  >
>;

export interface CreateAccountRecord {
  id: string;
  external_account_id: string;
  name: string;
  session_path: string;
}

/** Cached conversation ownership/route (a cache of Odoo's decisions). */
export interface RouteRepository {
  getRoute(
    gatewayAccountId: string,
    chatId: string,
  ): Promise<ConversationRoute | null>;
  /** Upsert the route's owner + status. */
  setRoute(
    gatewayAccountId: string,
    chatId: string,
    owner: string,
    status: RouteStatus,
  ): Promise<ConversationRoute>;
}

export interface AccountRepository {
  create(input: CreateAccountRecord): Promise<AccountRecord>;
  getById(id: string): Promise<AccountRecord | null>;
  getByExternalId(externalId: string): Promise<AccountRecord | null>;
  list(): Promise<AccountRecord[]>;
  update(id: string, patch: AccountUpdate): Promise<AccountRecord | null>;
  delete(id: string): Promise<boolean>;
}

export interface CapturedMessageRow {
  id: string;
  gateway_account_id: string;
  wa_message_id: string | null;
  chat_id: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  media_path?: string | null;
  media_mime?: string | null;
  media_filename?: string | null;
  media_size?: number | null;
  normalized_payload: unknown;
}

/** Stored media reference used to serve an attachment back to the console. */
export interface MediaRef {
  media_path: string;
  media_mime: string | null;
  media_filename: string | null;
}

export interface OutboundMessageRow {
  id: string;
  gateway_account_id: string;
  request_id: string;
  chat_id: string;
  type: string;
  body: string | null;
  wa_message_id: string | null;
}

export interface MessageRepository {
  /** Store an observed message (inbound or fromMe), deduped by wa_message_id. */
  capture(row: CapturedMessageRow): Promise<boolean>;
  /** Insert an outbound message keyed by request_id (idempotent). */
  insertOutbound(row: OutboundMessageRow): Promise<{ duplicate: boolean }>;
  getByRequestId(requestId: string): Promise<OutboundMessageRow | null>;
  setOutboundWaId(requestId: string, waMessageId: string): Promise<void>;
  /** Record a delivery/read receipt on the stored message (bookkeeping). */
  updateStatusByWaId(
    accountId: string,
    waMessageId: string,
    status: string,
  ): Promise<void>;
  /** Resolve a stored media attachment for an account's message. */
  getMediaRef(accountId: string, messageId: string): Promise<MediaRef | null>;
  listChats(accountId: string, limit: number): Promise<ChatSummary[]>;
  listMessages(
    accountId: string,
    chatId: string,
    limit: number,
  ): Promise<ChatMessage[]>;
}

export interface WebhookRecord {
  id: string;
  event_type: string;
  gateway_account_id: string | null;
  payload: unknown;
  message: string | null;
}

/** Filter + pagination for the Logs event feed. */
export interface EventListFilter {
  limit: number;
  offset: number;
  eventType?: string;
  status?: string;
}

/** A delivery the outbox worker has claimed for (re)dispatch. */
export interface DueDelivery {
  id: string;
  event_type: string;
  gateway_account_id: string | null;
  payload: unknown;
  attempts: number;
  /** ISO timestamp; reused as the stable `occurred_at` on every retry. */
  created_at: string;
}

export interface WebhookRepository {
  record(input: WebhookRecord): Promise<void>;
  updateStatus(
    id: string,
    status: string,
    attempts: number,
    lastError: string | null,
    delivered: boolean,
  ): Promise<void>;
  /** Claim pending deliveries whose next_attempt_at is due. */
  claimDue(limit: number): Promise<DueDelivery[]>;
  markDelivered(id: string, attempts: number): Promise<void>;
  reschedule(
    id: string,
    attempts: number,
    nextAttemptAt: Date,
    lastError: string | null,
  ): Promise<void>;
  markDead(id: string, attempts: number, lastError: string | null): Promise<void>;
  markSkipped(id: string): Promise<void>;
  /** Reset a delivery for replay. Returns true when a row was reset. */
  redeliver(id: string): Promise<boolean>;
  listRecent(limit: number): Promise<EventLogItem[]>;
  /** Filtered, paginated list for the Logs screen. */
  list(filter: EventListFilter): Promise<EventLogItem[]>;
  /** Total rows matching a filter (ignoring limit/offset). */
  count(filter: EventListFilter): Promise<number>;
  /** Full event detail (payload + delivery diagnostics). */
  getById(id: string): Promise<EventLogDetail | null>;
  /** Distinct event types present, for the filter dropdown. */
  distinctEventTypes(): Promise<string[]>;
}

export interface AdminRecord {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface AdminRepository {
  getByUsername(username: string): Promise<AdminRecord | null>;
  create(input: {
    id: string;
    username: string;
    password_hash: string;
  }): Promise<AdminRecord>;
  updatePassword(username: string, passwordHash: string): Promise<void>;
  count(): Promise<number>;
}

export interface SettingRow {
  key: string;
  value: string;
}

export interface SettingsRepository {
  getAll(): Promise<SettingRow[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
