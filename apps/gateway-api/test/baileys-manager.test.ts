import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BaileysManager } from "../src/services/baileys-manager.service";
import { MediaStore } from "../src/services/media-store.service";
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

/** Poll until `fn` returns an array of at least `n` items (or time out). */
async function waitForLength<T>(
  fn: () => Promise<T[]>,
  n: number,
): Promise<T[]> {
  for (let i = 0; i < 50; i += 1) {
    const r = await fn();
    if (r.length >= n) return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  return fn();
}

function setup() {
  const accountRepo = new InMemoryAccountRepository();
  const messageRepo = new InMemoryMessageRepository();
  const webhookRepo = new InMemoryWebhookRepository();
  const webhook = new WebhookDispatcher(webhookRepo); // no baseUrl -> records only
  const fake = new FakeSocket();
  const mediaStore = new MediaStore(
    path.join(tmpdir(), `lp-test-media-${Math.random().toString(36).slice(2)}`),
  );
  const manager = new BaileysManager({
    socketFactory: async () => ({
      socket: fake as unknown as BaileysSocket,
      saveCreds: async () => {},
      isRegistered: false,
      downloadMedia: async () => Buffer.from("fake-media-bytes"),
    }),
    accountRepo,
    messageRepo,
    webhook,
    sessionRoot: path.join(tmpdir(), "lp-test-sessions"),
    mediaStore,
    companyKey: () => "test-corp",
  });
  return { accountRepo, messageRepo, webhookRepo, fake, manager, mediaStore };
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
    // The emitted message.received payload is stamped with tenant + owner.
    const emitted = webhookRepo.records.find(
      (r) => r.event_type === "message.received",
    );
    const payload = emitted?.payload as { company_key?: string; owner?: string };
    expect(payload?.company_key).toBe("test-corp");
    expect(payload?.owner).toBe("odoo");
  });

  it("stores an inbound image, downloads its media, and emits a webhook", async () => {
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
          key: { remoteJid: "573001112233@s.whatsapp.net", id: "IMG1", fromMe: false },
          message: {
            imageMessage: {
              mimetype: "image/jpeg",
              caption: "look",
              fileLength: 16,
            },
          },
          pushName: "Maria",
          messageTimestamp: 1700000002,
        },
      ],
    });
    const msgs = await waitForLength(
      () => messageRepo.listMessages("a1", "573001112233@s.whatsapp.net", 10),
      1,
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.type).toBe("image");
    expect(msgs[0]?.body).toBe("look");
    expect(msgs[0]?.media_mime).toBe("image/jpeg");
    // The downloaded file is resolvable via the repo's media ref.
    const ref = await messageRepo.getMediaRef("a1", msgs[0]!.id);
    expect(ref?.media_path).toBeTruthy();
    const events = await webhookRepo.listRecent(10);
    expect(
      events.filter((e) => e.event_type === "message.received"),
    ).toHaveLength(1);
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

  it("backfills history (both directions) without webhooks", async () => {
    const { accountRepo, messageRepo, webhookRepo, manager, fake } = setup();
    await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start("a1");
    fake.emit("messaging-history.set", {
      messages: [
        {
          key: { remoteJid: "573001112233@s.whatsapp.net", id: "H1", fromMe: false },
          message: { conversation: "old inbound" },
          pushName: "Maria",
          messageTimestamp: 1699999999,
        },
        {
          key: { remoteJid: "573001112233@s.whatsapp.net", id: "H2", fromMe: true },
          message: { conversation: "old outbound" },
          messageTimestamp: 1700000000,
        },
      ],
    });
    await tick();
    const msgs = await messageRepo.listMessages(
      "a1",
      "573001112233@s.whatsapp.net",
      10,
    );
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.direction).sort()).toEqual(["inbound", "outbound"]);
    const events = await webhookRepo.listRecent(10);
    expect(events.filter((e) => e.event_type === "message.received")).toHaveLength(0);
  });

  it("emits message.status from a delivery receipt on a fromMe message", async () => {
    const { accountRepo, messageRepo, webhookRepo, manager, fake } = setup();
    await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start("a1");
    fake.emit("messages.update", [
      {
        key: {
          remoteJid: "573009998877@s.whatsapp.net",
          id: "WAID-OUT-1",
          fromMe: true,
        },
        update: { status: 3 }, // DELIVERY_ACK
      },
    ]);
    await tick();
    const statuses = webhookRepo.records.filter(
      (r) => r.event_type === "message.status",
    );
    expect(statuses).toHaveLength(1);
    const payload = statuses[0]?.payload as {
      wa_message_id?: string;
      chat_id?: string;
      status?: string;
      company_key?: string;
    };
    expect(payload?.wa_message_id).toBe("WAID-OUT-1");
    expect(payload?.chat_id).toBe("573009998877@s.whatsapp.net");
    expect(payload?.status).toBe("delivered");
    expect(payload?.company_key).toBe("test-corp");
    expect(messageRepo.statusByWaId.get("a1:WAID-OUT-1")).toBe("delivered");
  });

  it("ignores receipts for inbound messages and in-flight updates", async () => {
    const { accountRepo, webhookRepo, manager, fake } = setup();
    await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start("a1");
    fake.emit("messages.update", [
      // not ours
      { key: { remoteJid: "x@s.whatsapp.net", id: "IN-1", fromMe: false }, update: { status: 4 } },
      // ours but only PENDING (1) -> no status
      { key: { remoteJid: "x@s.whatsapp.net", id: "OUT-2", fromMe: true }, update: { status: 1 } },
      // ours but no status at all (e.g. an edit)
      { key: { remoteJid: "x@s.whatsapp.net", id: "OUT-3", fromMe: true }, update: {} },
    ]);
    await tick();
    const statuses = webhookRepo.records.filter(
      (r) => r.event_type === "message.status",
    );
    expect(statuses).toHaveLength(0);
  });

  it("maps a read receipt (message-receipt.update) to read", async () => {
    const { accountRepo, webhookRepo, manager, fake } = setup();
    await accountRepo.create({
      id: "a1",
      external_account_id: "x1",
      name: "A1",
      session_path: "/tmp/a1",
    });
    await manager.start("a1");
    fake.emit("message-receipt.update", [
      {
        key: {
          remoteJid: "573009998877@s.whatsapp.net",
          id: "WAID-OUT-9",
          fromMe: true,
        },
        receipt: { receiptTimestamp: 1700000000, readTimestamp: 1700000005 },
      },
    ]);
    await tick();
    const statuses = webhookRepo.records.filter(
      (r) => r.event_type === "message.status",
    );
    expect(statuses).toHaveLength(1);
    expect((statuses[0]?.payload as { status?: string })?.status).toBe("read");
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
