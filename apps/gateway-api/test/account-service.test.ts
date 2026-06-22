import { describe, expect, it } from "vitest";
import {
  AccountExistsError,
  AccountNotConnectedError,
  AccountService,
} from "../src/services/account.service";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  InMemoryAccountRepository,
  InMemoryMessageRepository,
  InMemorySettingsRepository,
} from "../src/stores/memory";
import { MediaStore } from "../src/services/media-store.service";
import { SettingsService } from "../src/services/settings.service";
import { loadConfig } from "../src/config";
import type { BaileysManager } from "../src/services/baileys-manager.service";

function fakeManager(): BaileysManager {
  return {
    start: async () => ({}),
    stop: async () => {},
    logout: async () => {},
    reconnect: async () => {},
    isRunning: () => false,
    sendText: async () => "WAID-9",
    sendMedia: async () => "WAID-MEDIA",
  } as unknown as BaileysManager;
}

function setup() {
  const accountRepo = new InMemoryAccountRepository();
  const messageRepo = new InMemoryMessageRepository();
  const settings = new SettingsService(
    new InMemorySettingsRepository(),
    loadConfig({ ...process.env, DATABASE_URL: undefined }),
  );
  const service = new AccountService(
    accountRepo,
    messageRepo,
    fakeManager(),
    "/tmp/sessions",
    new MediaStore(path.join(tmpdir(), "lp-test-media")),
    settings,
  );
  return { accountRepo, messageRepo, service };
}

describe("AccountService", () => {
  it("creates an account and rejects duplicate external ids", async () => {
    const { service } = setup();
    const acc = await service.create({ external_account_id: "x1", name: "A" });
    expect(acc.external_account_id).toBe("x1");
    expect(acc.state).toBe("created");
    await expect(
      service.create({ external_account_id: "x1", name: "B" }),
    ).rejects.toBeInstanceOf(AccountExistsError);
  });

  it("rejects sending when not connected", async () => {
    const { service } = setup();
    const acc = await service.create({ external_account_id: "x1", name: "A" });
    await expect(
      service.sendMessage({
        request_id: "r1",
        gateway_account_id: acc.id,
        chat_id: "c@s.whatsapp.net",
        type: "text",
        text: "hi",
      }),
    ).rejects.toBeInstanceOf(AccountNotConnectedError);
  });

  it("sends once and is idempotent on request_id", async () => {
    const { service, accountRepo } = setup();
    const acc = await service.create({ external_account_id: "x1", name: "A" });
    await accountRepo.update(acc.id, { state: "connected" });

    const input = {
      request_id: "r1",
      gateway_account_id: acc.id,
      chat_id: "c@s.whatsapp.net",
      type: "text" as const,
      text: "hi",
    };
    const first = await service.sendMessage(input);
    expect(first.duplicate).toBe(false);
    expect(first.wa_message_id).toBe("WAID-9");

    const second = await service.sendMessage(input);
    expect(second.duplicate).toBe(true);
  });

  it("sends media: stores an outbound row with the saved file", async () => {
    const { service, accountRepo, messageRepo } = setup();
    const acc = await service.create({ external_account_id: "x1", name: "A" });
    await accountRepo.update(acc.id, { state: "connected" });

    const result = await service.sendMediaMessage({
      request_id: "rm1",
      gateway_account_id: acc.id,
      chat_id: "c@s.whatsapp.net",
      buffer: Buffer.from("PDFDATA"),
      mimetype: "application/pdf",
      filename: "doc.pdf",
      caption: "here",
    });
    expect(result.duplicate).toBe(false);
    expect(result.wa_message_id).toBe("WAID-MEDIA");

    const msgs = await messageRepo.listMessages(acc.id, "c@s.whatsapp.net", 10);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.direction).toBe("outbound");
    expect(msgs[0]?.type).toBe("document");
    expect(msgs[0]?.media_mime).toBe("application/pdf");
    const ref = await messageRepo.getMediaRef(acc.id, msgs[0]!.id);
    expect(ref?.media_path).toBeTruthy();

    // Idempotent on request_id.
    const again = await service.sendMediaMessage({
      request_id: "rm1",
      gateway_account_id: acc.id,
      chat_id: "c@s.whatsapp.net",
      buffer: Buffer.from("PDFDATA"),
      mimetype: "application/pdf",
      filename: "doc.pdf",
      caption: "here",
    });
    expect(again.duplicate).toBe(true);
  });
});
