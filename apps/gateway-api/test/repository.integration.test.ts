import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, closePool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { PgAccountRepository } from "../src/stores/account.repository";
import { PgMessageRepository } from "../src/stores/message.repository";
import { PgWebhookRepository } from "../src/stores/webhook.repository";

const DB = process.env.DATABASE_URL;

// Runs only when a Postgres URL is provided (CI service container).
describe.skipIf(!DB)("Postgres repositories", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getPool(DB);
    await runMigrations(pool);
  });
  afterAll(async () => {
    await closePool();
  });

  it("creates, updates, lists and deletes an account", async () => {
    const repo = new PgAccountRepository(pool);
    const ext = `ext-${randomUUID()}`;
    const created = await repo.create({
      id: randomUUID(),
      external_account_id: ext,
      name: "Repo Test",
      session_path: "/tmp/x",
    });
    expect(created.state).toBe("created");

    const updated = await repo.update(created.id, {
      state: "connected",
      phone_number: "573001112233",
    });
    expect(updated?.state).toBe("connected");
    expect(updated?.phone_number).toBe("573001112233");

    const byExt = await repo.getByExternalId(ext);
    expect(byExt?.id).toBe(created.id);

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.getById(created.id)).toBeNull();
  });

  it("dedupes inbound messages by wa_message_id", async () => {
    const accounts = new PgAccountRepository(pool);
    const messages = new PgMessageRepository(pool);
    const acc = await accounts.create({
      id: randomUUID(),
      external_account_id: `ext-${randomUUID()}`,
      name: "Msg Test",
      session_path: "/tmp/x",
    });
    const row = {
      id: randomUUID(),
      gateway_account_id: acc.id,
      wa_message_id: "WA-DUP",
      chat_id: "c@s.whatsapp.net",
      type: "text",
      body: "hi",
      normalized_payload: { a: 1 },
    };
    expect(await messages.insertInbound(row)).toBe(true);
    expect(await messages.insertInbound({ ...row, id: randomUUID() })).toBe(false);
    await accounts.delete(acc.id);
  });

  it("records and lists webhook events", async () => {
    const repo = new PgWebhookRepository(pool);
    const id = randomUUID();
    await repo.record({
      id,
      event_type: "account.connected",
      gateway_account_id: null,
      payload: { ok: true },
      message: "hi",
    });
    await repo.updateStatus(id, "delivered", 1, null, true);
    const recent = await repo.listRecent(5);
    expect(recent.some((e) => e.id === id)).toBe(true);
  });
});
