# DEC-001 One Baileys socket per account, behind an injectable factory

## Status

Accepted

## Context

The gateway must hold live WhatsApp Web sessions for many accounts and react to
asynchronous events (QR, connect, disconnect, inbound messages). Baileys is the
WhatsApp Web library; its sockets are event-driven and stateful. We also need
the runtime to be unit-testable without a real WhatsApp connection.

## Decision

Run one Baileys socket per account inside a `BaileysManager` (`Map<accountId,
runtime>`). Socket creation is abstracted behind a `SocketFactory` interface
(`services/socket.types.ts`): production uses the real factory
(`services/baileys-socket.ts`), tests inject a fake socket that emits the same
events. The manager depends only on the interface, never on Baileys directly.

The API is left unauthenticated within the developer-01 environment so the
browser console can call it; real auth is deferred (the Security screen is a
placeholder).

## Rationale

- The factory seam makes the manager fully unit-testable (QR → state, open →
  webhook, upsert → stored/deduped) with no network.
- One socket per account isolates failures and matches Baileys' model.
- Deferring auth keeps the first functional release small; it is a known gap,
  documented and visible in the UI.

## Consequences

- Tests cover behaviour without WhatsApp; the real socket is exercised only in
  live hand-testing on developer-01.
- Production must add authentication before exposure beyond a dev environment.
