# DEC-002 Postgres for account, message and event persistence

## Status

Accepted

## Context

Accounts, the message log, and the events feed (Logs screen) must survive
restarts and support querying. Baileys session credentials are a separate
concern (binary key material that Baileys manages as files).

## Decision

Add a `postgres:16` container to the gateway compose stack (internal to the
stack's network, no host port) with three tables — `gateway_accounts`,
`gateway_messages`, `gateway_webhook_deliveries`. Migrations are plain SQL under
`apps/gateway-api/migrations`, applied on boot by an idempotent runner tracked in
`schema_migrations`. Baileys credentials stay on the file auth store under
`SESSION_ROOT` on a Docker volume.

## Rationale

- Postgres matches the planned architecture and is already the house database.
- `gateway_webhook_deliveries` doubles as the Logs event feed, avoiding a second
  table for v1.
- Boot-time SQL migrations keep deploys to a single `docker compose up --build`.
- Repository interfaces allow in-memory fakes for unit tests; a Postgres service
  in CI validates the real SQL.

## Consequences

- The dev-01 stack now runs two containers (gateway-api + db).
- Heavier message/media history features can extend these tables later;
  BullMQ/Redis for webhook retries remains deferred (in-process for now).
