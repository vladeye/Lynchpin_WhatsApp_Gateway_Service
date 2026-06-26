import { describe, expect, it, vi } from "vitest";
import { EVENT_GATEWAY_HANDSHAKE } from "@lynchpin-whatsapp-gateway/shared-types";
import {
  WebhookDispatcher,
  joinUrl,
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

describe("joinUrl", () => {
  it("tolerates a trailing slash on the base", () => {
    expect(joinUrl("https://n8n.example.com/webhook/", "/wa/v1/gateway/inbound")).toBe(
      "https://n8n.example.com/webhook/wa/v1/gateway/inbound",
    );
  });
});

describe("WebhookDispatcher.emit (record-only)", () => {
  it("records a pending delivery and notifies the worker — no HTTP", async () => {
    const repo = new InMemoryWebhookRepository();
    const notify = vi.fn();
    const dispatcher = new WebhookDispatcher(repo, { notify });

    await dispatcher.emit(EVENT_GATEWAY_HANDSHAKE, null, {
      company_key: "doctorapiesitos",
    });

    expect(repo.records).toHaveLength(1);
    expect(repo.records[0]?.status).toBe("pending");
    expect(repo.records[0]?.event_type).toBe(EVENT_GATEWAY_HANDSHAKE);
    expect(notify).toHaveBeenCalledOnce();
  });
});
