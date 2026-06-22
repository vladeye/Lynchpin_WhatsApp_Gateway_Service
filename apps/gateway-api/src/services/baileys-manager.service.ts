import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  EVENT_MESSAGE_RECEIVED,
  type MessageReceivedEvent,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type { AccountRepository, MessageRepository } from "../stores/types";
import { clearSession } from "../stores/auth-store/file-auth-store";
import { normalizeInbound } from "./normalizer";
import { mediaKindFromMime, type MediaStore } from "./media-store.service";
import type { WebhookDispatcher } from "./webhook-dispatch.service";
import {
  isLoggedOut,
  type BaileysSocket,
  type ConnectionUpdate,
  type HistorySet,
  type MessagesUpsert,
  type OutgoingContent,
  type SocketFactory,
} from "./socket.types";
import type { BaileysMessage } from "./normalizer";

interface Runtime {
  accountId: string;
  socket: BaileysSocket;
  stopped: boolean;
  reconnectAttempts: number;
  downloadMedia?: (msg: BaileysMessage) => Promise<Buffer | null>;
}

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];

export interface BaileysManagerDeps {
  socketFactory: SocketFactory;
  accountRepo: AccountRepository;
  messageRepo: MessageRepository;
  webhook: WebhookDispatcher;
  sessionRoot: string;
  mediaStore?: MediaStore;
  /** Live provider for the "sync full history" setting (per new connection). */
  syncFullHistory?: () => boolean;
  logger?: Logger;
}

export interface StartOptions {
  usePairingCode?: boolean;
  phoneNumber?: string;
}

function digitsFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const user = jid.split(":")[0]?.split("@")[0];
  return user ?? null;
}

/** Owns the live WhatsApp sockets, one per account. */
export class BaileysManager {
  private readonly runtimes = new Map<string, Runtime>();

  constructor(private readonly deps: BaileysManagerDeps) {}

  isRunning(accountId: string): boolean {
    return this.runtimes.has(accountId);
  }

  /** Open a socket for an account. Returns a pairing code when requested. */
  async start(
    accountId: string,
    options: StartOptions = {},
  ): Promise<{ pairingCode?: string }> {
    const existing = this.runtimes.get(accountId);
    if (existing) {
      existing.stopped = true;
      existing.socket.end();
      this.runtimes.delete(accountId);
    }

    const { socket, saveCreds, isRegistered, downloadMedia } =
      await this.deps.socketFactory({
        accountId,
        sessionRoot: this.deps.sessionRoot,
        syncFullHistory: this.deps.syncFullHistory?.() ?? true,
      });

    const runtime: Runtime = {
      accountId,
      socket,
      stopped: false,
      reconnectAttempts: 0,
      downloadMedia,
    };
    this.runtimes.set(accountId, runtime);

    socket.ev.on("creds.update", () => {
      void saveCreds();
    });
    socket.ev.on("connection.update", (u) => {
      void this.onConnectionUpdate(accountId, u);
    });
    socket.ev.on("messages.upsert", (m) => {
      void this.onMessages(accountId, m);
    });
    socket.ev.on("messaging-history.set", (h) => {
      void this.onHistorySet(accountId, h);
    });

    await this.deps.accountRepo.update(accountId, {
      state: "connecting",
      last_error: null,
    });

    if (options.usePairingCode && !isRegistered && options.phoneNumber) {
      const phone = options.phoneNumber.replace(/[^0-9]/g, "");
      const pairingCode = await socket.requestPairingCode(phone);
      await this.deps.accountRepo.update(accountId, { state: "waiting_code" });
      return { pairingCode };
    }

    return {};
  }

  async sendText(
    accountId: string,
    chatId: string,
    text: string,
  ): Promise<string | null> {
    const runtime = this.runtimes.get(accountId);
    if (!runtime) {
      throw new Error("ACCOUNT_NOT_CONNECTED");
    }
    const res = await runtime.socket.sendMessage(chatId, { text });
    return res?.key?.id ?? null;
  }

  /** Send a media attachment; the content shape is chosen from its mime type. */
  async sendMedia(
    accountId: string,
    chatId: string,
    file: {
      buffer: Buffer;
      mimetype: string | null;
      filename: string | null;
      caption?: string | null;
    },
  ): Promise<string | null> {
    const runtime = this.runtimes.get(accountId);
    if (!runtime) {
      throw new Error("ACCOUNT_NOT_CONNECTED");
    }
    const caption = file.caption || undefined;
    const mimetype = file.mimetype ?? undefined;
    let content: OutgoingContent;
    switch (mediaKindFromMime(file.mimetype)) {
      case "image":
        content = { image: file.buffer, caption, mimetype };
        break;
      case "video":
        content = { video: file.buffer, caption, mimetype };
        break;
      case "audio":
        content = { audio: file.buffer, mimetype };
        break;
      default:
        content = {
          document: file.buffer,
          mimetype,
          fileName: file.filename ?? "file",
          caption,
        };
    }
    const res = await runtime.socket.sendMessage(chatId, content);
    return res?.key?.id ?? null;
  }

  async stop(accountId: string): Promise<void> {
    const runtime = this.runtimes.get(accountId);
    if (runtime) {
      runtime.stopped = true;
      runtime.socket.end();
      this.runtimes.delete(accountId);
    }
    await this.deps.accountRepo.update(accountId, {
      state: "disconnected",
      last_disconnected_at: new Date().toISOString(),
    });
  }

  async logout(accountId: string): Promise<void> {
    const runtime = this.runtimes.get(accountId);
    if (runtime) {
      runtime.stopped = true;
      try {
        await runtime.socket.logout();
      } catch {
        // ignore — we clear local state regardless
      }
      this.runtimes.delete(accountId);
    }
    await this.handleLoggedOut(accountId);
  }

  private async onConnectionUpdate(
    accountId: string,
    u: ConnectionUpdate,
  ): Promise<void> {
    const runtime = this.runtimes.get(accountId);

    this.deps.logger?.info(
      {
        accountId,
        connection: u.connection,
        hasQr: Boolean(u.qr),
        statusCode: (
          u.lastDisconnect?.error as
            | { output?: { statusCode?: number } }
            | undefined
        )?.output?.statusCode,
      },
      "connection.update",
    );

    if (u.qr) {
      await this.deps.accountRepo.update(accountId, {
        state: "waiting_qr",
        last_qr: u.qr,
      });
    }

    if (u.connection === "open") {
      const phone = digitsFromJid(runtime?.socket.user?.id);
      if (runtime) runtime.reconnectAttempts = 0;
      await this.deps.accountRepo.update(accountId, {
        state: "connected",
        phone_number: phone,
        display_name: runtime?.socket.user?.name ?? null,
        self_lid: runtime?.socket.user?.lid ?? null,
        last_qr: null,
        last_error: null,
        last_connected_at: new Date().toISOString(),
      });
      await this.deps.webhook.emit(
        "account.connected",
        accountId,
        { phone_number: phone },
        "Account connected",
      );
    }

    if (u.connection === "close") {
      if (isLoggedOut(u.lastDisconnect?.error)) {
        this.runtimes.delete(accountId);
        await this.handleLoggedOut(accountId);
        return;
      }
      await this.deps.accountRepo.update(accountId, {
        state: "disconnected",
        last_disconnected_at: new Date().toISOString(),
      });
      await this.deps.webhook.emit(
        "account.disconnected",
        accountId,
        { reason: "connection_close" },
        "Connection lost",
      );
      if (runtime && !runtime.stopped) {
        this.scheduleReconnect(accountId, runtime);
      }
    }
  }

  private scheduleReconnect(accountId: string, runtime: Runtime): void {
    const delay =
      BACKOFF_MS[Math.min(runtime.reconnectAttempts, BACKOFF_MS.length - 1)]!;
    runtime.reconnectAttempts += 1;
    setTimeout(() => {
      if (this.runtimes.get(accountId) !== runtime || runtime.stopped) return;
      this.runtimes.delete(accountId);
      void this.start(accountId).catch((err) => {
        this.deps.logger?.error({ err, accountId }, "reconnect failed");
      });
    }, delay).unref?.();
  }

  private async handleLoggedOut(accountId: string): Promise<void> {
    await clearSession(this.deps.sessionRoot, accountId);
    await this.deps.accountRepo.update(accountId, {
      state: "logged_out",
      last_qr: null,
      logged_out_at: new Date().toISOString(),
    });
    await this.deps.webhook.emit(
      "account.logged_out",
      accountId,
      {},
      "Logged out",
    );
  }

  private async onMessages(
    accountId: string,
    upsert: MessagesUpsert,
  ): Promise<void> {
    this.deps.logger?.info(
      {
        accountId,
        type: upsert.type,
        count: upsert.messages.length,
        fromMe: upsert.messages.map((m) => Boolean(m.key?.fromMe)),
        keys: upsert.messages.map((m) =>
          m.message ? Object.keys(m.message) : null,
        ),
      },
      "messages.upsert",
    );
    if (upsert.type !== "notify" && upsert.type !== "append") return;
    for (const msg of upsert.messages) {
      await this.captureMessage(accountId, msg, { emitWebhook: true });
    }
  }

  /** Backfill past messages delivered by Baileys on connect (history sync). */
  private async onHistorySet(
    accountId: string,
    history: HistorySet,
  ): Promise<void> {
    this.deps.logger?.info(
      { accountId, count: history.messages?.length ?? 0 },
      "messaging-history.set",
    );
    for (const msg of history.messages ?? []) {
      // No webhook for historical messages — avoid flooding n8n with old data.
      await this.captureMessage(accountId, msg, { emitWebhook: false });
    }
  }

  /**
   * Normalize and store a single message (either direction), deduped by
   * wa_message_id. Emits the inbound webhook only for live inbound messages.
   */
  private async captureMessage(
    accountId: string,
    msg: BaileysMessage,
    options: { emitWebhook: boolean },
  ): Promise<void> {
    const event = normalizeInbound(accountId, msg);
    if (event.event !== EVENT_MESSAGE_RECEIVED) return;
    const received = event as MessageReceivedEvent;
    const fromMe = Boolean(msg.key?.fromMe);
    const id = randomUUID();

    // Download and persist any attachment so the conversation view can show it.
    const { media } = received.payload.message;
    const saved = media
      ? await this.saveMedia(accountId, id, msg, media)
      : null;

    const stored = await this.deps.messageRepo.capture({
      id,
      gateway_account_id: accountId,
      wa_message_id: received.payload.message.wa_message_id,
      chat_id: received.payload.conversation.chat_id,
      direction: fromMe ? "outbound" : "inbound",
      type: received.payload.message.type,
      body: received.payload.message.text,
      // media_mime is set only when the file actually downloaded, so the
      // console can treat it as "renderable media is available".
      media_path: saved?.relativePath ?? null,
      media_mime: saved ? (media?.mimetype ?? null) : null,
      media_filename: saved ? (media?.filename ?? null) : null,
      media_size: saved?.size ?? null,
      normalized_payload: received,
    });
    if (!stored || fromMe) return; // duplicate, or our own message
    if (options.emitWebhook) {
      await this.deps.webhook.emit(
        "message.received",
        accountId,
        received.payload,
        received.payload.message.text ?? `(${received.payload.message.type})`,
      );
    }
  }

  /** Download a message's media via the account socket and store it on disk. */
  private async saveMedia(
    accountId: string,
    messageId: string,
    msg: BaileysMessage,
    media: { mimetype: string | null; filename: string | null },
  ): Promise<{ relativePath: string; size: number } | null> {
    const downloader = this.runtimes.get(accountId)?.downloadMedia;
    if (!downloader || !this.deps.mediaStore) return null;
    try {
      const buffer = await downloader(msg);
      if (!buffer || buffer.length === 0) return null;
      return await this.deps.mediaStore.save(
        accountId,
        messageId,
        buffer,
        media.mimetype,
        media.filename,
      );
    } catch (err) {
      this.deps.logger?.error({ err, accountId }, "media download/save failed");
      return null;
    }
  }
}
