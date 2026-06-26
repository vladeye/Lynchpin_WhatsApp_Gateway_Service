import type { BaileysMessage } from "./normalizer";

/** Minimal subset of a Baileys socket the gateway depends on. */
export interface ConnectionUpdate {
  connection?: "connecting" | "open" | "close";
  qr?: string;
  lastDisconnect?: { error?: unknown };
}

export interface MessagesUpsert {
  type: string;
  messages: BaileysMessage[];
}

export interface HistorySet {
  messages: BaileysMessage[];
}

/** Minimal message key shared by upsert/update/receipt events. */
export interface MessageKey {
  id?: string | null;
  remoteJid?: string | null;
  fromMe?: boolean | null;
}

/** `messages.update`: carries the numeric delivery `status` for a message. */
export interface MessageStatusUpdate {
  key?: MessageKey;
  update?: { status?: number | null };
}

/** `message-receipt.update`: per-recipient delivery/read receipt timestamps. */
export interface MessageReceiptUpdate {
  key?: MessageKey;
  receipt?: { receiptTimestamp?: number | null; readTimestamp?: number | null };
}

export interface BaileysSocket {
  ev: {
    on(event: "connection.update", listener: (u: ConnectionUpdate) => void): void;
    on(event: "creds.update", listener: () => void): void;
    on(event: "messages.upsert", listener: (m: MessagesUpsert) => void): void;
    on(
      event: "messaging-history.set",
      listener: (h: HistorySet) => void,
    ): void;
    on(
      event: "messages.update",
      listener: (u: MessageStatusUpdate[]) => void,
    ): void;
    on(
      event: "message-receipt.update",
      listener: (u: MessageReceiptUpdate[]) => void,
    ): void;
  };
  user?: {
    id?: string | null;
    name?: string | null;
    lid?: string | null;
  } | null;
  requestPairingCode(phoneNumber: string): Promise<string>;
  sendMessage(
    jid: string,
    content: { text: string },
  ): Promise<{ key?: { id?: string | null } } | undefined>;
  logout(): Promise<void>;
  end(): void;
}

export interface SocketCreateArgs {
  accountId: string;
  sessionRoot: string;
  /** Whether to request full history sync on connect (editable setting). */
  syncFullHistory?: boolean;
}

export interface CreatedSocket {
  socket: BaileysSocket;
  saveCreds: () => Promise<void>;
  isRegistered: boolean;
  /**
   * Download the binary content of a media message. Returns null when the
   * message has no media or the download fails. Injectable so tests can stub it.
   */
  downloadMedia?: (msg: BaileysMessage) => Promise<Buffer | null>;
}

/** Injectable so tests can supply a fake socket instead of real Baileys. */
export type SocketFactory = (args: SocketCreateArgs) => Promise<CreatedSocket>;

/** Boom/Baileys disconnect status code for a logged-out device. */
export const LOGGED_OUT_STATUS = 401;

export function isLoggedOut(error: unknown): boolean {
  const code = (error as { output?: { statusCode?: number } } | undefined)
    ?.output?.statusCode;
  return code === LOGGED_OUT_STATUS;
}
