import { describe, expect, it } from "vitest";
import {
  OutboxDispatcher,
  backoffMs,
} from "../src/services/outbox-dispatcher.service";
import { InMemoryWebhookRepository } from "../src/stores/memory";

function makeFetch(status: () => number) {
  const calls: { url: string; body: string; headers: Headers }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: String(init?.body ?? ""),
      headers: new Headers(init?.headers),
    });
    return new Response(null, { status: status() });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function baseOpts(fetchImpl: typeof fetch, extra = {}) {
  return {
    baseUrlProvider: () => "https://n8n.example.com/webhook",
    secret: "s3cr3t",
    fetchImpl,
    maxAttempts: 3,
    ...extra,
  };
}

async function record(repo: InMemoryWebhookRepository, eventType = "message.received") {
  await repo.record({
    id: "evt-1",
    event_type: eventType,
    gateway_account_id: "a1",
    payload: { x: 1 },
    message: null,
  });
}

/** Force the single record due (e.g. to simulate the backoff window elapsing). */
function makeDue(repo: InMemoryWebhookRepository) {
  repo.records[0]!.next_attempt_at = new Date(0).toISOString();
}

describe("backoffMs", () => {
  it("grows exponentially and is capped at one hour", () => {
    expect(backoffMs(1)).toBeLessThanOrEqual(5_000);
    expect(backoffMs(2)).toBeGreaterThan(5_000);
    expect(backoffMs(20)).toBeLessThanOrEqual(60 * 60 * 1_000);
  });
});

describe("OutboxDispatcher", () => {
  it("dispatches a due delivery with a stable signed body and marks it delivered", async () => {
    const repo = new InMemoryWebhookRepository();
    const { calls, fetchImpl } = makeFetch(() => 200);
    const worker = new OutboxDispatcher(repo, baseOpts(fetchImpl));
    await record(repo);

    await worker.tick();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://n8n.example.com/webhook/wa/v1/gateway/inbound");
    expect(calls[0]?.headers.get("X-Webhook-Signature")).toBeTruthy();
    const body = JSON.parse(calls[0]!.body);
    expect(body.event_id).toBe("evt-1");
    expect(body.event).toBe("message.received");
    expect(body.occurred_at).toBe(repo.records[0]?.created_at);
    expect(repo.records[0]?.status).toBe("delivered");
  });

  it("reschedules on failure, retries only once due, and keeps the body stable", async () => {
    const repo = new InMemoryWebhookRepository();
    const status = { code: 500 };
    const { calls, fetchImpl } = makeFetch(() => status.code);
    const worker = new OutboxDispatcher(repo, baseOpts(fetchImpl));
    await record(repo);
    const before = Date.now();

    await worker.tick(); // attempt 1 fails -> reschedule into the future
    expect(calls).toHaveLength(1);
    expect(repo.records[0]?.status).toBe("pending");
    expect(repo.records[0]?.attempts).toBe(1);
    expect(Date.parse(repo.records[0]!.next_attempt_at)).toBeGreaterThan(before);

    await worker.tick(); // not due yet
    expect(calls).toHaveLength(1);

    makeDue(repo);
    status.code = 200; // n8n recovers
    await worker.tick();
    expect(calls).toHaveLength(2);
    // Same envelope on the retry (idempotent for the consumer).
    expect(JSON.parse(calls[1]!.body).event_id).toBe(JSON.parse(calls[0]!.body).event_id);
    expect(repo.records[0]?.status).toBe("delivered");
    expect(repo.records[0]?.attempts).toBe(2);
  });

  it("marks a delivery dead after max attempts", async () => {
    const repo = new InMemoryWebhookRepository();
    const { fetchImpl } = makeFetch(() => 500);
    const worker = new OutboxDispatcher(repo, baseOpts(fetchImpl, { maxAttempts: 3 }));
    await record(repo);

    for (let i = 0; i < 5; i += 1) {
      makeDue(repo);
      await worker.tick();
    }

    expect(repo.records[0]?.status).toBe("dead");
    expect(repo.records[0]?.attempts).toBe(3);
  });

  it("skips when no base URL is configured", async () => {
    const repo = new InMemoryWebhookRepository();
    const { calls, fetchImpl } = makeFetch(() => 200);
    const worker = new OutboxDispatcher(repo, {
      fetchImpl,
      baseUrlProvider: () => undefined,
    });
    await record(repo);

    await worker.tick();

    expect(calls).toHaveLength(0);
    expect(repo.records[0]?.status).toBe("skipped");
  });

  it("redeliver resets a delivered row and re-dispatches", async () => {
    const repo = new InMemoryWebhookRepository();
    const { calls, fetchImpl } = makeFetch(() => 200);
    const worker = new OutboxDispatcher(repo, baseOpts(fetchImpl));
    await record(repo);
    await worker.tick();
    expect(repo.records[0]?.status).toBe("delivered");

    expect(await repo.redeliver("evt-1")).toBe(true);
    expect(repo.records[0]?.status).toBe("pending");
    expect(repo.records[0]?.attempts).toBe(0);

    await worker.tick();
    expect(calls).toHaveLength(2);
    expect(repo.records[0]?.status).toBe("delivered");
  });
});
