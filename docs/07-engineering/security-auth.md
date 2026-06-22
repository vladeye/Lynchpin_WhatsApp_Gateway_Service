# Security & Authentication

## Status

Active — `apps/gateway-api` (`services/auth.service.ts`, `plugins/auth-guard.ts`,
`routes/auth.ts`) + console Login / Security screens.

## What it does

Single-admin authentication for the console and API.

- **Admin account** — one admin stored in `gateway_admins` (scrypt-hashed
  password). Seeded on first boot from `ADMIN_USERNAME` / `ADMIN_PASSWORD` if no
  admin exists; the password is changed afterwards on the Security screen.
- **Sessions** — `POST /api/auth/login` verifies credentials and sets an
  `httpOnly` `gw_session` cookie holding an HMAC-signed token
  (`utils/token.ts`, signed with `AUTH_SECRET`, TTL `AUTH_TOKEN_TTL_HOURS`).
  `POST /api/auth/logout` clears it; `GET /api/auth/me` echoes the admin.
- **Guard** — an `onRequest` hook protects every `/api/*` route. It accepts a
  valid session cookie (console) **or** the `X-Gateway-Api-Key` header
  (programmatic clients such as n8n). `/api`, `/api/auth/login`, `/health`,
  `/ready` and static assets are open. Media (`/api/accounts/:id/media/:id`) is
  protected; browsers send the session cookie automatically on `<img>` loads.
- **API key** — seeded from `GATEWAY_API_KEY`, stored in `gateway_settings`, and
  rotatable via `POST /api/security/rotate-api-key` (the new key is shown once).
- **Password change** — `POST /api/auth/change-password` re-checks the current
  password before updating.

## Access

`/api/auth/login` (public), all other `/api/*` require auth. MFA is intentionally
out of scope for this milestone.

## Depends

- `gateway_admins`, `gateway_settings` (migration `0004`).
- `node:crypto` scrypt (password hashing) + HMAC (token signing) — no extra deps.

## See also

- [Admin Console](admin-console.md)
- [DEC-004 — Single-admin console auth](../08-decisions/DEC-004-console-auth.md)
- [Parameters & runtime settings](runtime-settings.md)
