import { randomUUID } from "node:crypto";
import type {
  Account,
  AccountStatus,
  ChatMessage,
  ChatSummary,
  SendMessageInput,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type {
  AccountRecord,
  AccountRepository,
  MessageRepository,
} from "../stores/types";
import { clearSession, sessionDir } from "../stores/auth-store/file-auth-store";
import type { BaileysManager } from "./baileys-manager.service";
import type { MediaStore } from "./media-store.service";
import type { SettingsService } from "./settings.service";

/** A media attachment resolved to an absolute path ready to stream. */
export interface ResolvedMedia {
  path: string;
  mime: string | null;
  filename: string | null;
}

export class AccountExistsError extends Error {}
export class AccountNotFoundError extends Error {}
export class AccountNotConnectedError extends Error {}
export class MessageTooLongError extends Error {}

function toStatus(rec: AccountRecord): AccountStatus {
  return {
    id: rec.id,
    external_account_id: rec.external_account_id,
    name: rec.name,
    state: rec.state,
    phone_number: rec.phone_number,
    display_name: rec.display_name,
    last_error: rec.last_error,
    last_qr: rec.last_qr,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    last_connected_at: rec.last_connected_at,
  };
}

function toAccount(rec: AccountRecord): Account {
  const { last_qr: _lastQr, ...status } = toStatus(rec);
  return status;
}

export class AccountService {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly messageRepo: MessageRepository,
    private readonly manager: BaileysManager,
    private readonly sessionRoot: string,
    private readonly mediaStore: MediaStore,
    private readonly settings: SettingsService,
  ) {}

  async list(): Promise<Account[]> {
    return (await this.accountRepo.list()).map(toAccount);
  }

  private async require(id: string): Promise<AccountRecord> {
    const rec = await this.accountRepo.getById(id);
    if (!rec) throw new AccountNotFoundError(id);
    return rec;
  }

  async status(id: string): Promise<AccountStatus> {
    return toStatus(await this.require(id));
  }

  async listChats(id: string): Promise<ChatSummary[]> {
    await this.require(id);
    return this.messageRepo.listChats(id, 100);
  }

  async listMessages(id: string, chatId: string): Promise<ChatMessage[]> {
    await this.require(id);
    return this.messageRepo.listMessages(id, chatId, 300);
  }

  /** Resolve a stored media attachment to an absolute path for streaming. */
  async getMedia(id: string, messageId: string): Promise<ResolvedMedia | null> {
    await this.require(id);
    const ref = await this.messageRepo.getMediaRef(id, messageId);
    if (!ref) return null;
    return {
      path: this.mediaStore.resolve(ref.media_path),
      mime: ref.media_mime,
      filename: ref.media_filename,
    };
  }

  async create(input: {
    external_account_id: string;
    name: string;
  }): Promise<Account> {
    const existing = await this.accountRepo.getByExternalId(
      input.external_account_id,
    );
    if (existing) throw new AccountExistsError(input.external_account_id);
    const id = randomUUID();
    const rec = await this.accountRepo.create({
      id,
      external_account_id: input.external_account_id,
      name: input.name,
      session_path: sessionDir(this.sessionRoot, id),
    });
    return toAccount(rec);
  }

  async connectQr(id: string): Promise<AccountStatus> {
    await this.require(id);
    await this.manager.start(id, {});
    return this.status(id);
  }

  async connectCode(
    id: string,
    phoneNumber: string,
  ): Promise<{ account: AccountStatus; pairing_code: string | null }> {
    await this.require(id);
    const { pairingCode } = await this.manager.start(id, {
      usePairingCode: true,
      phoneNumber,
    });
    return { account: await this.status(id), pairing_code: pairingCode ?? null };
  }

  async disconnect(id: string, logout: boolean): Promise<AccountStatus> {
    await this.require(id);
    if (logout) {
      await this.manager.logout(id);
    } else {
      await this.manager.stop(id);
    }
    return this.status(id);
  }

  async reconnect(id: string): Promise<AccountStatus> {
    await this.require(id);
    await this.manager.start(id, {});
    return this.status(id);
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    if (this.manager.isRunning(id)) {
      await this.manager.stop(id);
    }
    await clearSession(this.sessionRoot, id);
    await this.accountRepo.delete(id);
  }

  async sendMessage(input: SendMessageInput): Promise<{
    wa_message_id: string | null;
    status: string;
    duplicate: boolean;
  }> {
    const rec = await this.accountRepo.getById(input.gateway_account_id);
    if (!rec) throw new AccountNotFoundError(input.gateway_account_id);
    if (rec.state !== "connected") {
      throw new AccountNotConnectedError(input.gateway_account_id);
    }
    if (input.text.length > this.settings.maxTextLength()) {
      throw new MessageTooLongError(input.gateway_account_id);
    }

    const { duplicate } = await this.messageRepo.insertOutbound({
      id: randomUUID(),
      gateway_account_id: input.gateway_account_id,
      request_id: input.request_id,
      chat_id: input.chat_id,
      type: "text",
      body: input.text,
      wa_message_id: null,
    });
    if (duplicate) {
      const existing = await this.messageRepo.getByRequestId(input.request_id);
      return {
        wa_message_id: existing?.wa_message_id ?? null,
        status: "sent",
        duplicate: true,
      };
    }

    const waId = await this.manager.sendText(
      input.gateway_account_id,
      input.chat_id,
      input.text,
    );
    if (waId) {
      await this.messageRepo.setOutboundWaId(input.request_id, waId);
    }
    return { wa_message_id: waId, status: "sent", duplicate: false };
  }
}
