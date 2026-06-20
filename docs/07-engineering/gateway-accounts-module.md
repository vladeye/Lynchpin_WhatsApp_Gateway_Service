# Gateway Accounts & Baileys Runtime

## Status

Active — the WhatsApp session manager and account lifecycle.

## What it does

Manages one WhatsApp Web session per gateway account through Baileys, and exposes
a clean HTTP API for it. The gateway is transport-only: it normalizes WhatsApp
events and forwards them; it makes no business decisions.

- **Account registry** — `gateway_accounts` (Postgres). Each account maps an
  `external_account_id` (Odoo/n8n) to a local session and tracks `state`,
  `phone_number`, `last_qr`, `last_error`, timestamps.
- **Lifecycle states** — `created → waiting_qr | waiting_code → connecting →
  connected ↔ disconnected`, plus `logged_out` and `error`.
- **Baileys runtime** (`services/baileys-manager.service.ts`) — one socket per
  account in a `Map`. Socket creation is behind an injectable `SocketFactory`
  (`services/socket.types.ts`) so unit tests use a fake socket. It wires:
  - `connection.update` → store QR / mark connected (+ `account.connected`
    webhook) / on close reconnect with backoff `[2,5,15,30,60]s` unless the
    device was logged out.
  - `creds.update` → persist to the file auth store.
  - `messages.upsert` → normalize (`services/normalizer.ts`) → store
    (deduped on `gateway_account_id + wa_message_id`) → `message.received`
    webhook.
- **Sessions** — Baileys multi-file auth under `SESSION_ROOT/<accountId>`
  (`stores/auth-store/file-auth-store.ts`), on a Docker volume so sessions
  survive restarts. `SessionLifecycle.restoreAll()` re-opens accounts on boot.
- **Outbound** — `POST /api/messages/send` is idempotent on `request_id`
  (`gateway_messages` unique index).
- **Events / webhooks** — every event is recorded in
  `gateway_webhook_deliveries` and (when `N8N_WEBHOOK_BASE_URL` is set) POSTed to
  n8n with an `X-Webhook-Signature` HMAC (`utils/crypto.ts`).

## Access

HTTP API under `/api` (see `routes/accounts.ts`, `routes/messages.ts`):

```text
GET    /api/accounts                 POST /api/accounts/:id/connect/qr
POST   /api/accounts                 POST /api/accounts/:id/connect/code
GET    /api/accounts/:id/status      POST /api/accounts/:id/disconnect
POST   /api/accounts/:id/reconnect   DELETE /api/accounts/:id
POST   /api/messages/send            GET  /api/events
```

> The API is currently unauthenticated within developer-01 (see
> [DEC-001](../08-decisions/DEC-001-baileys-runtime.md) and the Security screen).

## Depends

- `@whiskeysockets/baileys`, `pg`, Fastify, Zod, Pino.
- `packages/shared-types` for the account/event contracts.

## See also

- [Admin Console](admin-console.md)
- [DEC-001](../08-decisions/DEC-001-baileys-runtime.md),
  [DEC-002](../08-decisions/DEC-002-postgres-persistence.md),
  [DEC-003](../08-decisions/DEC-003-qr-via-polling.md)
