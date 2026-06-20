# Admin Console

## Status

Active — `apps/admin-web`, served by gateway-api at `/`.

## What it does

A React + Vite single-page console (green WhatsApp Gateway theme) served as
static files by gateway-api (`@fastify/static`, SPA fallback). Data flows through
`src/lib/api.ts` (TanStack Query) to the gateway `/api` and `/health` endpoints.

- **Login** (`/`) — styled entry; no real auth yet (routes to the console).
- **Dashboard** (`/dashboard`) — live status cards (gateway/readiness/account
  counts) polling `/health`, `/ready`, `/api/accounts`.
- **Accounts** (`/accounts`) — table of accounts; **Add account**; **Connect**
  dialog with a QR tab (starts QR connect, polls `/api/accounts/:id/status`, and
  renders the `last_qr` with `qrcode.react`) and a pairing-code tab; row actions
  disconnect / logout / reconnect / delete.
- **Logs** (`/logs`) — recent events from `/api/events`.
- **Parameters** (`/parameters`) — read-only effective config from
  `/api/parameters`.
- **Security** (`/security`) — placeholder; auth/roles/MFA not yet implemented.

## Access

Public over HTTPS at `https://dev01-gateway.doctorapiesitos.com` (no login
enforced yet within developer-01).

## Depends

- `react`, `react-router-dom`, `@tanstack/react-query`, `qrcode.react`,
  Tailwind CSS.
- Backend `/api` from the [Gateway Accounts module](gateway-accounts-module.md).

## See also

- [Gateway Accounts & Baileys Runtime](gateway-accounts-module.md)
