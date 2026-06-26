# DEC-005 Webhook delivery via a Postgres outbox

## Status

Accepted

## Context

The gateway emits events (handshake, `message.received`, later status/mirror) to
n8n. The first implementation POSTed **inline** inside `WebhookDispatcher.emit()`
and `await`ed the result, so message capture blocked on n8n latency, and a single
failed POST marked the row `failed` permanently — the event was lost with no
retry. We need at-least-once delivery that survives n8n being down or slow,
without coupling the capture path to it.

## Decision

Make delivery **persist-then-dispatch** using the existing
`gateway_webhook_deliveries` table as an outbox:

- `emit()` only **records** the delivery (`pending`, `next_attempt_at = now`) and
  returns; it fires a non-awaited `kick()`.
- A single in-process `OutboxDispatcher` worker drains due rows
  (`status='pending' AND next_attempt_at <= now`), POSTs each with the HMAC
  signature, and on the result marks `delivered`, or reschedules with exponential
  backoff (5s ×4, cap 1h, jittered) until `OUTBOX_MAX_ATTEMPTS`, after which it is
  `dead`. No n8n base URL → `skipped`.
- The POST body is rebuilt deterministically from stored columns
  (`event_id = row id`, `occurred_at = created_at`), so it is **identical on every
  retry** and consumers (Odoo, dedup on `external_message_id`) stay idempotent.
- Replay: `POST /api/events/:id/redeliver` resets a row to `pending` and kicks the
  worker; the Logs detail modal exposes a **Redeliver** button.

Redis/BullMQ is intentionally **not** used yet — a Postgres outbox + one worker
covers WhatsApp-rate traffic; the queue upgrade (DLQ, multiple workers) is M7 and
needs only a worker swap, not a contract change.

## Rationale

- Decouples capture from n8n: the gateway never blocks on, or loses events to, a
  down/slow n8n.
- The delivery table already existed (DEC-002) and doubles as the Logs feed.
- A stable body + idempotent consumers make at-least-once safe and replays free.
- Single in-process worker with non-overlapping ticks keeps it simple; a leased
  claim (`FOR UPDATE SKIP LOCKED` is already in place) is only needed for multiple
  gateway instances.

## Consequences

- Happy-path delivery is now asynchronous (a `kick()` away, not awaited) — a few
  ms later than the old inline POST, which is irrelevant for fire-and-forget events.
- Status vocabulary changed: the terminal `failed` is replaced by
  pending-with-backoff → `dead`; the Logs filter lists `dead` (and keeps `failed`
  for historical rows).
- New tunables: `OUTBOX_POLL_MS`, `OUTBOX_BATCH`, `OUTBOX_MAX_ATTEMPTS`.
