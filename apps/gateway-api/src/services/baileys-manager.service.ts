import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  EVENT_MESSAGE_RECEIVED,
  EVENT_MESSAGE_STATUS,
  type MessageDeliveryStatus,
  type MessageReceivedEvent,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type { AccountRepository, MessageRepository } from "../stores/types";
import { clearSession } from "../stores/auth-store/file-auth-store";
import { normalizeInbound } from "./normalizer";
import type { MediaStore } from "./media-store.service";
import type { WebhookDispatcher } from "./webhook-dispatch.service";
import {
  isLoggedOut,
  type BaileysSocket,
  type ConnectionUpdate,
  type HistorySet,
  type MessageKey,
  type MessageReceiptUpdate,
  type MessageStatusUpdate,
  type MessagesUpsert,
  type SocketFactory,
} from "./socket.types";
import type { BaileysMessage } from "./normalizer";

interface Runtime {
  accountId: string;
  socket: BaileysSocket;
  stopped: boolean;
  reconnectAttempts: number;
  conflictCount: number;
  stableTimer?: ReturnType<typeof setTimeout>;
  downloadMedia?: (msg: BaileysMessage) => Promise<Buffer | null>;
}

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];
// WhatsApp stream-error status for "conflict: replaced" (another client took
// over the session) — DisconnectReason.connectionReplaced in Baileys.
const CONFLICT_STATUS = 440;
// Give up reconnecting after this many consecutive session-replaced conflicts.
const MAX_CONFLICTS = 5;
// A connection must stay open this long before we clear the reconnect backoff.
const STABLE_MS = 10_000;

export interface BaileysManagerDeps {
  socketFactory: SocketFactory;
  accountRepo: AccountRepository;
  messageRepo: MessageRepository;
  webhook: WebhookDispatcher;
  sessionRoot: string;
  mediaStore?: MediaStore;
  /** Live provider for the "sync full history" setting (per new connection). */
  syncFullHistory?: () => boolean;
  /** Corporate this gateway acts for, stamped onto every emitted event. */
  companyKey?: () => string;
  /**
   * Cached conversation owner + route status (a cache of Odoo's routing
   * decisions). Looked up per inbound to stamp the event; defaults to
   * odoo/active when absent. The gateway never decides ownership.
   */
  routeFor?: (
    accountId: string,
    chatId: string,
  ) => Promise<{ owner: string; status: string }>;
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

/**
 * Map Baileys' numeric message status (proto WebMessageInfo.Status) to our
 * delivery vocabulary. PENDING (1) is in-flight and yields no event.
 */
function deliveryStatusFromCode(
  code: number | null | undefined,
): MessageDeliveryStatus | null {
  switch (code) {
    case 0: // ERROR
      return "failed";
    case 2: // SERVER_ACK
      return "sent";
    case 3: // DELIVERY_ACK
      return "delivered";
    case 4: // READ
    case 5: // PLAYED
      return "read";
    default:
      return null;
  }
}

/** Owns the live WhatsApp sockets, one per account. */
export class BaileysManager {
  private readonly runtimes = new Map<string, Runtime>();

  // Learned mapping from a contact @lid JID to their phone-number JID
  // (<phone>@s.whatsapp.net). WhatsApp 1:1 delivery needs the phone JID; @lid
  // inbound messages carry the sender PN, captured here to address replies.
  private readonly lidPhone = new Map<string, string>();

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
      conflictCount: 0,
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
    socket.ev.on("messages.update", (u) => {
      void this.onStatusUpdate(accountId, u);
    });
    socket.ev.on("message-receipt.update", (u) => {
      void this.onReceiptUpdate(accountId, u);
    });
    socket.ev.on("chats.phoneNumberShare", (u) => {
      this.rememberLidPhone(u?.lid, u?.jid, accountId);
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

  // Record a contact @lid -> phone-number JID mapping (idempotent).
  private rememberLidPhone(
    lid: string | null | undefined,
    phoneJid: string | null | undefined,
    accountId: string,
  ): void {
    if (!lid || !phoneJid || !lid.endsWith("@lid")) return;
    const normalized = phoneJid.includes("@")
      ? phoneJid
      : `${phoneJid}@s.whatsapp.net`;
    if (this.lidPhone.get(lid) === normalized) return;
    this.lidPhone.set(lid, normalized);
    this.deps.logger?.info(
      { accountId, lid, phoneJid: normalized },
      "lid->phone mapping learned",
    );
  }

  // Best-effort capture of the sender phone JID from a raw inbound message.
  // Baileys surfaces it inconsistently, so probe known fields; the full raw key
  // is also logged (messages.upsert) to confirm the shape on this build.
  private captureLidPhoneFromMessage(
    accountId: string,
    msg: BaileysMessage,
  ): void {
    const key = msg.key as unknown as
      | ({ remoteJid?: string | null; fromMe?: boolean | null } & Record<
          string,
          unknown
        >)
      | undefined;
    if (!key || key.fromMe) return;
    const lid = key.remoteJid ?? undefined;
    if (!lid || !lid.endsWith("@lid")) return;
    const pn =
      (key.senderPn as string | undefined) ??
      (key.sender_pn as string | undefined) ??
      (key.participantPn as string | undefined) ??
      (key.remoteJidAlt as string | undefined) ??
      ((msg as unknown as Record<string, unknown>).senderPn as
        | string
        | undefined);
    if (pn) this.rememberLidPhone(lid, pn, accountId);
  }

  // Choose the JID to send to. WhatsApp 1:1 delivery needs the phone-number JID,
  // so when the conversation id is an @lid we swap in the learned phone JID.
  // Falls back to the @lid until the phone is known.
  private resolveSendJid(chatId: string): string {
    if (!chatId.endsWith("@lid")) return chatId;
    return this.lidPhone.get(chatId) ?? chatId;
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
    const target = this.resolveSendJid(chatId);
    this.deps.logger?.info(
      { accountId, chatId, target, resolved: target !== chatId },
      "sendText target",
    );
    const res = await runtime.socket.sendMessage(target, { text });
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
    const statusCode = (
      u.lastDisconnect?.error as
        | { output?: { statusCode?: number } }
        | undefined
    )?.output?.statusCode;

    this.deps.logger?.info(
      {
        accountId,
        connection: u.connection,
        hasQr: Boolean(u.qr),
        statusCode,
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
      if (runtime) {
        // Clear the backoff only once the socket proves STABLE. A connection
        // that opens then is immediately "replaced" (conflict 440) must keep
        // its growing backoff, or it flaps ~1.5x/sec fighting the other client.
        if (runtime.stableTimer) clearTimeout(runtime.stableTimer);
        runtime.stableTimer = setTimeout(() => {
          runtime.reconnectAttempts = 0;
          runtime.conflictCount = 0;
        }, STABLE_MS);
        runtime.stableTimer.unref?.();
      }
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
      if (runtime?.stableTimer) {
        clearTimeout(runtime.stableTimer);
        runtime.stableTimer = undefined;
      }
      if (isLoggedOut(u.lastDisconnect?.error)) {
        this.runtimes.delete(accountId);
        await this.handleLoggedOut(accountId);
        return;
      }

      // conflict/replaced (440): another client holds this WhatsApp session.
      // Reconnecting just gets us replaced again, so cap the fight and STOP —
      // a clean re-link (remove the other linked devices) is required to fix it.
      if (statusCode === CONFLICT_STATUS && runtime) {
        runtime.conflictCount += 1;
        if (runtime.conflictCount >= MAX_CONFLICTS) {
          runtime.stopped = true;
          this.runtimes.delete(accountId);
          runtime.socket.end();
          await this.deps.accountRepo.update(accountId, {
            state: "disconnected",
            last_error:
              "session replaced by another device — re-link required",
            last_disconnected_at: new Date().toISOString(),
          });
          await this.deps.webhook.emit(
            "account.disconnected",
            accountId,
            { reason: "session_replaced" },
            "Session replaced — re-link required",
          );
          this.deps.logger?.error(
            { accountId, conflictCount: runtime.conflictCount },
            "stopping reconnect: WhatsApp session repeatedly replaced",
          );
          return;
        }
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
        rawKeys: upsert.messages.map((m) => m.key ?? null),
      },
      "messages.upsert",
    );
    for (const m of upsert.messages) {
      this.captureLidPhoneFromMessage(accountId, m);
    }
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
      // Stamp the cached owner + route status (a cache of Odoo's decisions);
      // defaults to odoo/active. The gateway always emits — owner/route_status
      // are labels n8n/Odoo act on; the gateway never decides ownership.
      const chatId = received.payload.conversation.chat_id;
      const route = (await this.deps.routeFor?.(accountId, chatId)) ?? {
        owner: "odoo",
        status: "active",
      };
      await this.deps.webhook.emit(
        "message.received",
        accountId,
        {
          ...received.payload,
          company_key: this.deps.companyKey?.() ?? null,
          owner: route.owner,
          route_status: route.status,
        },
        received.payload.message.text ?? `(${received.payload.message.type})`,
      );
    }
  }

  /**
   * Delivery/read receipts for our outbound messages arrive as `messages.update`
   * with a numeric `update.status`. Emit a `message.status` event per receipt so
   * Odoo can advance the matching message; ignore inbound and in-flight updates.
   */
  private async onStatusUpdate(
    accountId: string,
    updates: MessageStatusUpdate[],
  ): Promise<void> {
    for (const u of updates ?? []) {
      if (!u.key?.fromMe) continue; // receipts are only for messages we sent
      const status = deliveryStatusFromCode(u.update?.status);
      if (!status) continue;
      await this.emitStatus(accountId, u.key, status);
    }
  }

  /**
   * Per-recipient receipts (`message-receipt.update`) carry timestamps rather
   * than a status code. A read timestamp implies read; otherwise a delivery
   * timestamp implies delivered. Odoo applies these monotonically, so any
   * overlap with `messages.update` is harmless.
   */
  private async onReceiptUpdate(
    accountId: string,
    updates: MessageReceiptUpdate[],
  ): Promise<void> {
    for (const u of updates ?? []) {
      if (!u.key?.fromMe) continue;
      const status: MessageDeliveryStatus | null = u.receipt?.readTimestamp
        ? "read"
        : u.receipt?.receiptTimestamp
          ? "delivered"
          : null;
      if (!status) continue;
      await this.emitStatus(accountId, u.key, status);
    }
  }

  /** Record the receipt on our own row and emit the `message.status` event. */
  private async emitStatus(
    accountId: string,
    key: MessageKey,
    status: MessageDeliveryStatus,
  ): Promise<void> {
    const waMessageId = key.id;
    const chatId = key.remoteJid;
    if (!waMessageId || !chatId) return;
    await this.deps.messageRepo.updateStatusByWaId(
      accountId,
      waMessageId,
      status,
    );
    await this.deps.webhook.emit(
      EVENT_MESSAGE_STATUS,
      accountId,
      {
        company_key: this.deps.companyKey?.() ?? null,
        chat_id: chatId,
        wa_message_id: waMessageId,
        status,
        status_at: new Date().toISOString(),
      },
      `${status} ${waMessageId}`,
    );
  }

  /** Download a message's media via the account socket and store it on disk. */
  private async saveMedia(
    accountId: string,
    messageId: string,
    msg: BaileysMessage,
    media: { mimetype: string | null; filename: string | null },
  ): Promise<{ relativePath: string; size: number } | null> {
    const downloader = this.runtimes.get(accountId)?.downloadMedia;
    if (!downloader || !this.deps.mediaStore) {
      this.deps.logger?.warn(
        { accountId, messageId, mimetype: media.mimetype, hasDownloader: Boolean(downloader) },
        "saveMedia skipped: no downloader or media store",
      );
      return null;
    }
    try {
      const buffer = await downloader(msg);
      if (!buffer || buffer.length === 0) {
        this.deps.logger?.warn(
          { accountId, messageId, mimetype: media.mimetype },
          "saveMedia: empty media buffer (download returned nothing)",
        );
        return null;
      }
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
