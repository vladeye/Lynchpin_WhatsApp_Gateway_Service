import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { hmacSign } from "../utils/crypto";
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
function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export interface WebhookDispatchOptions {
  baseUrl?: string;
  /** Live override for the target URL (e.g. editable Parameters setting). */
  baseUrlProvider?: () => string | undefined;
  secret?: string;
  logger?: Logger;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Records every gateway event and (when configured) delivers it to n8n with an
 * HMAC signature. Delivery failures are recorded but never throw to the caller.
 */
export class WebhookDispatcher {
  private readonly baseUrl?: string;
  private readonly baseUrlProvider?: () => string | undefined;
  private readonly secret?: string;
  private readonly logger?: Logger;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly repo: WebhookRepository,
    options: WebhookDispatchOptions = {},
  ) {
    this.baseUrl = options.baseUrl;
    this.baseUrlProvider = options.baseUrlProvider;
    this.secret = options.secret;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async emit(
    eventType: string,
    accountId: string | null,
    payload: unknown,
    summary?: string,
  ): Promise<void> {
    const id = randomUUID();
    await this.repo.record({
      id,
      event_type: eventType,
      gateway_account_id: accountId,
      payload,
      message: summary ?? null,
    });

    const baseUrl = this.baseUrlProvider?.() ?? this.baseUrl;
    if (!baseUrl) {
      await this.repo.updateStatus(id, "skipped", 0, null, false);
      return;
    }

    const body = JSON.stringify({
      event: eventType,
      gateway_account_id: accountId,
      occurred_at: new Date().toISOString(),
      payload,
    });

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "X-Gateway-Event": eventType,
      };
      if (this.secret) {
        headers["X-Webhook-Signature"] = hmacSign(body, this.secret);
      }
      const res = await this.fetchImpl(joinUrl(baseUrl, pathForEvent(eventType)), {
        method: "POST",
        headers,
        body,
      });
      if (res.ok) {
        await this.repo.updateStatus(id, "delivered", 1, null, true);
      } else {
        await this.repo.updateStatus(id, "failed", 1, `HTTP ${res.status}`, false);
      }
    } catch (err) {
      this.logger?.warn({ err, eventType }, "webhook delivery failed");
      await this.repo.updateStatus(id, "failed", 1, String(err), false);
    }
  }
}
