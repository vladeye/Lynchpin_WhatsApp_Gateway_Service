import type { Logger } from "pino";
import { hmacSign } from "../utils/crypto";
import type { DueDelivery, WebhookRepository } from "../stores/types";
import { joinUrl, pathForEvent } from "./webhook-dispatch.service";

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_FACTOR = 4;
const BACKOFF_CAP_MS = 60 * 60 * 1_000;

/**
 * Delay before the n-th retry: exponential (5s, 20s, 80s, …) capped at 1h, with
 * down-only jitter (80–100% of the step) so retries don't thunder together and
 * never exceed the cap.
 */
export function backoffMs(attempts: number): number {
  const raw = BACKOFF_BASE_MS * BACKOFF_FACTOR ** (attempts - 1);
  const capped = Math.min(raw, BACKOFF_CAP_MS);
  return Math.round(capped * (0.8 + Math.random() * 0.2));
}

export interface OutboxOptions {
  baseUrlProvider?: () => string | undefined;
  secret?: string;
  logger?: Logger;
  pollMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock for tests. */
  now?: () => Date;
}

/**
 * Drains the webhook outbox: claims due deliveries, POSTs each to n8n with an
 * HMAC signature, and on failure reschedules with backoff (or marks it dead once
 * attempts are exhausted). Single in-process worker; ticks never overlap.
 */
export class OutboxDispatcher {
  private readonly baseUrlProvider?: () => string | undefined;
  private readonly secret?: string;
  private readonly logger?: Logger;
  private readonly pollMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly repo: WebhookRepository,
    options: OutboxOptions = {},
  ) {
    this.baseUrlProvider = options.baseUrlProvider;
    this.secret = options.secret;
    this.logger = options.logger;
    this.pollMs = options.pollMs ?? 2_000;
    this.batchSize = options.batchSize ?? 20;
    this.maxAttempts = options.maxAttempts ?? 8;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Process due deliveries now (e.g. right after one is recorded). */
  kick(): void {
    void this.tick();
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.repo.claimDue(this.batchSize);
      for (const row of due) await this.dispatch(row);
    } catch (err) {
      this.logger?.warn({ err }, "outbox tick failed");
    } finally {
      this.running = false;
    }
  }

  private async dispatch(row: DueDelivery): Promise<void> {
    const baseUrl = this.baseUrlProvider?.();
    if (!baseUrl) {
      await this.repo.markSkipped(row.id);
      return;
    }

    // Identical body on every retry → consumer idempotency (Odoo dedups on the
    // message id) holds. occurred_at is the original record time, not now.
    const body = JSON.stringify({
      event_id: row.id,
      event: row.event_type,
      gateway_account_id: row.gateway_account_id,
      occurred_at: row.created_at,
      payload: row.payload,
    });
    const attempts = row.attempts + 1;

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "X-Gateway-Event": row.event_type,
      };
      if (this.secret) {
        headers["X-Webhook-Signature"] = hmacSign(body, this.secret);
      }
      const res = await this.fetchImpl(
        joinUrl(baseUrl, pathForEvent(row.event_type)),
        { method: "POST", headers, body },
      );
      if (res.ok) {
        await this.repo.markDelivered(row.id, attempts);
      } else {
        await this.fail(row, attempts, `HTTP ${res.status}`);
      }
    } catch (err) {
      await this.fail(row, attempts, String(err));
    }
  }

  private async fail(
    row: DueDelivery,
    attempts: number,
    error: string,
  ): Promise<void> {
    if (attempts >= this.maxAttempts) {
      this.logger?.warn(
        { id: row.id, eventType: row.event_type, attempts, error },
        "outbox delivery dead",
      );
      await this.repo.markDead(row.id, attempts, error);
      return;
    }
    const next = new Date(this.now().getTime() + backoffMs(attempts));
    await this.repo.reschedule(row.id, attempts, next, error);
  }
}
