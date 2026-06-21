import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  EVENT_MESSAGE_RECEIVED,
  type MessageReceivedEvent,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type { AccountRepository, MessageRepository } from "../stores/types";
import { clearSession } from "../stores/auth-store/file-auth-store";
import { normalizeInbound } from "./normalizer";
import type { WebhookDispatcher } from "./webhook-dispatch.service";
import {
  isLoggedOut,
  type BaileysSocket,
  type ConnectionUpdate,
  type MessagesUpsert,
  type SocketFactory,
} from "./socket.types";

interface Runtime {
  accountId: string;
  socket: BaileysSocket;
  stopped: boolean;
  reconnectAttempts: number;
}

const BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];

export interface BaileysManagerDeps {
  socketFactory: SocketFactory;
  accountRepo: AccountRepository;
  messageRepo: MessageRepository;
  webhook: WebhookDispatcher;
  sessionRoot: string;
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

    const { socket, saveCreds, isRegistered } =
      await this.deps.socketFactory({
        accountId,
        sessionRoot: this.deps.sessionRoot,
      });

    const runtime: Runtime = {
      accountId,
      socket,
      stopped: false,
      reconnectAttempts: 0,
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
      const event = normalizeInbound(accountId, msg);
      if (event.event !== EVENT_MESSAGE_RECEIVED) continue;
      const received = event as MessageReceivedEvent;
      const fromMe = Boolean(msg.key?.fromMe);
      // Capture both directions so the conversation view mirrors WhatsApp;
      // fromMe messages (sent from the phone/other devices, or echoed from our
      // own sends) are stored as outbound and deduped by wa_message_id.
      const stored = await this.deps.messageRepo.capture({
        id: randomUUID(),
        gateway_account_id: accountId,
        wa_message_id: received.payload.message.wa_message_id,
        chat_id: received.payload.conversation.chat_id,
        direction: fromMe ? "outbound" : "inbound",
        type: received.payload.message.type,
        body: received.payload.message.text,
        normalized_payload: received,
      });
      if (!stored || fromMe) continue; // duplicate, or our own message
      await this.deps.webhook.emit(
        "message.received",
        accountId,
        received.payload,
        received.payload.message.text ?? "(message)",
      );
    }
  }
}
