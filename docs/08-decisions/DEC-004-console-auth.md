# DEC-004 Single-admin console authentication

## Status

Accepted

## Context

The console and `/api` were open within developer-01. The gateway captures real
conversations and can send messages, so it needs authentication. A full
multi-user/roles/MFA system is more than this milestone needs; programmatic
clients (n8n) also need a non-interactive path.

## Decision

Implement **single-admin** auth:

- One admin in `gateway_admins` (scrypt-hashed password), seeded on first boot
  from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
- Login issues an HMAC-signed token (dependency-free, `AUTH_SECRET`) stored in an
  `httpOnly` `gw_session` cookie. A global `onRequest` guard protects `/api/*`.
- Programmatic clients authenticate with the `X-Gateway-Api-Key` header; the key
  is seeded from `GATEWAY_API_KEY`, persisted in `gateway_settings`, and
  rotatable from the Security screen.
- No MFA (the login MFA field was removed).

## Rationale

- A cookie session lets the browser load protected media (`<img>`) without custom
  header plumbing, while the API-key path keeps n8n integrations simple.
- scrypt + HMAC use `node:crypto` only — no new dependencies.
- Single-admin matches a single-operator console; multi-user/roles/MFA can layer
  on later without changing the guard's shape.

## Consequences

- `ADMIN_PASSWORD` and a stable `AUTH_SECRET` must be set on dev-01; if no admin
  exists and no password is configured, login stays disabled (logged at boot).
- Tokens are invalidated if `AUTH_SECRET` changes (acceptable; forces re-login).
- Multi-user, roles, and MFA remain future work.
