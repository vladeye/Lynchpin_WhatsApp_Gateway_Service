import { randomUUID } from "node:crypto";
import type { WebhookRepository } from "../stores/types";

/** n8n versioned ingress paths. Status receipts split from everything else. */
const PATH_STATUS = "/wa/v1/gateway/status";
const PATH_INBOUND = "/wa/v1/gateway/inbound";

/**
 * Resolve the n8n path for an event type. Delivery/read/failed receipts go to
 * the status ingress; message and lifecycle events (and the boot handshake) go
 * to the inbound ingress, where n8n fans out by owner.
 */
export function pathForEvent(eventType: string): string {
  return eventType === "message.status" ? PATH_STATUS : PATH_INBOUND;
}

/** Join an n8n base URL with an ingress path, tolerating a trailing slash. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export interface WebhookDispatchOptions {
  /** Kick the outbox worker so a freshly-recorded event dispatches promptly. */
  notify?: () => void;
}

/**
 * Records every gateway event into the outbox. Delivery itself is handled
 * asynchronously by the {@link OutboxDispatcher}, so `emit` never blocks on n8n
 * and a failure is retried rather than lost (persist-then-dispatch).
 */
export class WebhookDispatcher {
  constructor(
    private readonly repo: WebhookRepository,
    private readonly options: WebhookDispatchOptions = {},
  ) {}

  async emit(
    eventType: string,
    accountId: string | null,
    payload: unknown,
    summary?: string,
  ): Promise<void> {
    await this.repo.record({
      id: randomUUID(),
      event_type: eventType,
      gateway_account_id: accountId,
      payload,
      message: summary ?? null,
    });
    this.options.notify?.();
  }
}
