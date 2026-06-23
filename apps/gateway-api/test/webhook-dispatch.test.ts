import { describe, expect, it } from "vitest";
import { EVENT_GATEWAY_HANDSHAKE } from "@lynchpin-whatsapp-gateway/shared-types";
import {
  WebhookDispatcher,
  pathForEvent,
} from "../src/services/webhook-dispatch.service";
import { InMemoryWebhookRepository } from "../src/stores/memory";

describe("pathForEvent", () => {
  it("routes status receipts to the status ingress", () => {
    expect(pathForEvent("message.status")).toBe("/wa/v1/gateway/status");
  });

  it("routes everything else to the inbound ingress", () => {
    expect(pathForEvent("message.received")).toBe("/wa/v1/gateway/inbound");
    expect(pathForEvent(EVENT_GATEWAY_HANDSHAKE)).toBe("/wa/v1/gateway/inbound");
  });
});

describe("WebhookDispatcher", () => {
  function capturingFetch() {
    const calls: { url: string; body: string; headers: Headers }[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: String(init?.body ?? ""),
        headers: new Headers(init?.headers),
      });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  it("posts the handshake to the inbound ingress and records delivery", async () => {
    const repo = new InMemoryWebhookRepository();
    const { calls, fetchImpl } = capturingFetch();
    const dispatcher = new WebhookDispatcher(repo, {
      baseUrl: "https://n8n.example.com/webhook/",
      secret: "s3cr3t",
      fetchImpl,
    });

    await dispatcher.emit(EVENT_GATEWAY_HANDSHAKE, null, {
      company_key: "doctorapiesitos",
      gateway_version: "1.2.3",
    });

    expect(calls).toHaveLength(1);
    // Trailing slash on the base is tolerated; the versioned path is appended.
    expect(calls[0]?.url).toBe("https://n8n.example.com/webhook/wa/v1/gateway/inbound");
    expect(calls[0]?.headers.get("X-Gateway-Event")).toBe(EVENT_GATEWAY_HANDSHAKE);
    expect(calls[0]?.headers.get("X-Webhook-Signature")).toBeTruthy();
    expect(JSON.parse(calls[0]!.body).payload.company_key).toBe("doctorapiesitos");
    expect(repo.records[0]?.status).toBe("delivered");
  });

  it("routes status events to the status ingress", async () => {
    const repo = new InMemoryWebhookRepository();
    const { calls, fetchImpl } = capturingFetch();
    const dispatcher = new WebhookDispatcher(repo, {
      baseUrl: "https://n8n.example.com/webhook",
      fetchImpl,
    });

    await dispatcher.emit("message.status", "acc_1", { status: "delivered" });

    expect(calls[0]?.url).toBe("https://n8n.example.com/webhook/wa/v1/gateway/status");
  });

  it("records the event as skipped when no base URL is configured", async () => {
    const repo = new InMemoryWebhookRepository();
    const { calls, fetchImpl } = capturingFetch();
    const dispatcher = new WebhookDispatcher(repo, { fetchImpl });

    await dispatcher.emit(EVENT_GATEWAY_HANDSHAKE, null, {
      company_key: "x",
      gateway_version: "1",
    });

    expect(calls).toHaveLength(0);
    expect(repo.records[0]?.status).toBe("skipped");
  });
});
