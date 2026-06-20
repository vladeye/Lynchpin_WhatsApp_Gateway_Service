# DEC-003 Deliver the QR code via status polling

## Status

Accepted

## Context

Baileys emits the login QR asynchronously and refreshes it periodically until the
user scans it. The console needs to display the current QR and detect when the
account becomes connected.

## Decision

Store the latest QR on the account (`gateway_accounts.last_qr`, updated from
`connection.update`). The console starts a connect (`POST
/api/accounts/:id/connect/qr`) and then **polls** `GET /api/accounts/:id/status`
every 2s, rendering `last_qr` with `qrcode.react` until `state` becomes
`connected`. No WebSocket is introduced.

## Rationale

- Polling is simple, stateless, and works through the existing nginx reverse
  proxy with no extra configuration.
- The QR already lives in the account record, so the status endpoint is the
  natural delivery channel.
- A few seconds of latency is irrelevant for a human scanning a code.

## Consequences

- No realtime channel yet; if sub-second updates or server-push are needed later
  (e.g. live message streams), a WebSocket can be added without changing this
  flow.
