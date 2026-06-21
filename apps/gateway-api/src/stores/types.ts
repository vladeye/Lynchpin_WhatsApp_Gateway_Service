import type {
  AccountState,
  ChatMessage,
  ChatSummary,
  EventLogItem,
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
  normalized_payload: unknown;
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

export interface WebhookRepository {
  record(input: WebhookRecord): Promise<void>;
  updateStatus(
    id: string,
    status: string,
    attempts: number,
    lastError: string | null,
    delivered: boolean,
  ): Promise<void>;
  listRecent(limit: number): Promise<EventLogItem[]>;
}
