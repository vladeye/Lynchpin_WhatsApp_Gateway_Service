import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BaileysManager } from "../src/services/baileys-manager.service";
import { WebhookDispatcher } from "../src/services/webhook-dispatch.service";
import {
  InMemoryAccountRepository,
  InMemoryMessageRepository,
  InMemoryWebhookRepository,
} from "../src/stores/memory";
import type { BaileysSocket } from "../src/services/socket.types";

class FakeSocket {
  private readonly listeners = new Map<string, ((arg: unknown) => void)[]>();
  user = { id: "573001112233:7@s.whatsapp.net", name: "Test User" };
  sent: { jid: string; text: string }[] = [];

  ev = {
    on: (event: string, listener: (arg: unknown) => void) => {
      const list = this.listeners.get(event) ?? [];
      list.push(listener);
      this.listeners.set(event, list);
    },
  };

  emit(event: string, arg?: unknown): void {
    for (const l of this.listeners.get(event) ?? []) l(arg);
  }

  async requestPairingCode(): Promise<string> {
    return "ABCD-1234";
  }
  async sendMessage(jid: string, content: { text: string }) {
    this.sent.push({ jid, text: content.text });
    return { key: { id: "WAID-1" } };
  }
  async logout(): Promise<void> {}
  end(): void {}
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const accountRepo = new InMemoryAccountRepository();
  const messageRepo = new InMemoryMessageRepository();
  const webhookRepo = new InMemoryWebhookRepository();
  const webhook = new WebhookDispatcher(webhookRepo); // no baseUrl -> records only
  const fake = new FakeSocket();
  const manager = new BaileysManager({
    socketFactory: async () => ({
      socket: fake as unknown as BaileysSocket,
      saveCreds: async () => {},
      isRegistered: false,
    }),
    accountRepo,
    messageRepo,
    webhook,
    sessionRoot: path.join(tmpdir(), "lp-test-sessions"),
  });
  return { accountRepo, messageRepo, webhookRepo, fake, manager };
}

describe("BaileysManager", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  it("stores the QR on connection.update", async () => {
    const { accountRepo, manager, fake } = setup();
    const acc = await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start(acc.id);
    fake.emit("connection.update", { qr: "2@QRDATA" });
    await tick();
    const rec = await accountRepo.getById("a1");
    expect(rec?.state).toBe("waiting_qr");
    expect(rec?.last_qr).toBe("2@QRDATA");
  });

  it("marks connected and emits account.connected on open", async () => {
    const { accountRepo, webhookRepo, manager, fake } = setup();
    await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start("a1");
    fake.emit("connection.update", { connection: "open" });
    await tick();
    const rec = await accountRepo.getById("a1");
    expect(rec?.state).toBe("connected");
    expect(rec?.phone_number).toBe("573001112233");
    const events = await webhookRepo.listRecent(10);
    expect(events.some((e) => e.event_type === "account.connected")).toBe(true);
  });

  it("stores inbound text and dedupes", async () => {
    const { accountRepo, messageRepo, webhookRepo, manager, fake } = setup();
    await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start("a1");
    const upsert = {
      type: "notify",
      messages: [
        {
          key: { remoteJid: "573001112233@s.whatsapp.net", id: "M1", fromMe: false },
          message: { conversation: "hola" },
          pushName: "Maria",
          messageTimestamp: 1700000000,
        },
      ],
    };
    fake.emit("messages.upsert", upsert);
    await tick();
    fake.emit("messages.upsert", upsert); // duplicate
    await tick();
    const msgs = await messageRepo.listMessages(
      "a1",
      "573001112233@s.whatsapp.net",
      10,
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.direction).toBe("inbound");
    const events = await webhookRepo.listRecent(10);
    expect(events.filter((e) => e.event_type === "message.received")).toHaveLength(1);
  });

  it("captures fromMe messages as outbound without a webhook", async () => {
    const { accountRepo, messageRepo, webhookRepo, manager, fake } = setup();
    await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start("a1");
    fake.emit("messages.upsert", {
      type: "notify",
      messages: [
        {
          key: { remoteJid: "573009998877@s.whatsapp.net", id: "M2", fromMe: true },
          message: { conversation: "yo escribí esto" },
          messageTimestamp: 1700000001,
        },
      ],
    });
    await tick();
    const msgs = await messageRepo.listMessages(
      "a1",
      "573009998877@s.whatsapp.net",
      10,
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.direction).toBe("outbound");
    const events = await webhookRepo.listRecent(10);
    expect(events.filter((e) => e.event_type === "message.received")).toHaveLength(0);
  });

  it("sends text through the socket", async () => {
    const { accountRepo, manager, fake } = setup();
    await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start("a1");
    const id = await manager.sendText("a1", "573001112233@s.whatsapp.net", "hi");
    expect(id).toBe("WAID-1");
    expect(fake.sent[0]?.text).toBe("hi");
  });
});
