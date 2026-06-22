# Admin Console

## Status

Active — `apps/admin-web`, served by gateway-api at `/`.

## What it does

A React + Vite single-page console (green WhatsApp Gateway theme) served as
static files by gateway-api (`@fastify/static`, SPA fallback). Data flows through
`src/lib/api.ts` (TanStack Query) to the gateway `/api` and `/health` endpoints.

- **Login** (`/`) — real single-admin login (`POST /api/auth/login`); on success
  a session cookie is set and the console is unlocked. Authenticated routes are
  wrapped in a `RequireAuth` guard that checks `/api/auth/me`.
- **Dashboard** (`/dashboard`) — live status cards (gateway/readiness/account
  counts) polling `/health`, `/ready`, `/api/accounts`.
- **Accounts** (`/accounts`) — table of accounts; **Add account**; **Connect**
  dialog with a QR tab (starts QR connect, polls `/api/accounts/:id/status`, and
  renders the `last_qr` with `qrcode.react`) and a pairing-code tab; row actions
  disconnect / logout / reconnect / delete; **View** opens Conversations.
- **Logs** (`/logs`) — filterable, paginated event feed from `/api/events`
  (event type + status filters); click a row for full detail (`/api/events/:id`)
  including the payload and delivery diagnostics.
- **Parameters** (`/parameters`) — editable runtime settings (`max_text_length`,
  `log_level`, `n8n_webhook_base_url`, `sync_full_history`) saved via
  `PUT /api/parameters`, plus the read-only effective configuration.
- **Security** (`/security`) — change the admin password and view/rotate the
  programmatic API key (`/api/security`). See [Security & Auth](security-auth.md).

## Access

Served over HTTPS at `https://dev01-gateway.doctorapiesitos.com`. The console and
`/api/*` now require authentication (single admin session cookie, or the
`X-Gateway-Api-Key` header for programmatic clients). `/health` and `/ready`
remain open.

## Depends

- `react`, `react-router-dom`, `@tanstack/react-query`, `qrcode.react`,
  Tailwind CSS.
- Backend `/api` from the [Gateway Accounts module](gateway-accounts-module.md).

## See also

- [Gateway Accounts & Baileys Runtime](gateway-accounts-module.md)
