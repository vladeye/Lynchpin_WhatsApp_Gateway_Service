# Parameters & Runtime Settings

## Status

Active — `apps/gateway-api` (`services/settings.service.ts`,
`stores/settings.repository.ts`, `routes/parameters.ts`) + console Parameters
screen.

## What it does

Layers persisted runtime settings over environment defaults so a few operational
knobs can be changed live without a redeploy.

- **Storage** — `gateway_settings (key, value)` (migration `0004`). On boot
  `SettingsService.load()` caches all rows; typed getters fall back to env.
- **Editable keys**
  - `max_text_length` — enforced live in `AccountService.sendMessage`.
  - `log_level` — applied live by setting the pino logger level.
  - `n8n_webhook_base_url` — read per-delivery by the webhook dispatcher.
  - `sync_full_history` — read by the Baileys socket factory; applies to the
    next connection (re-link) per account.
- **API**
  - `GET /api/parameters` → `{ effective, settings }` (read-only effective
    config + the editable settings with their current value and `overridden`
    flag).
  - `PUT /api/parameters` `{ key, value }` → validates, persists, applies, and
    returns the refreshed settings. Invalid values return `400 INVALID_SETTING`.

## Access

Authenticated console / API only (see [Security & Auth](security-auth.md)).

## Depends

- `gateway_settings` (migration `0004`); `SettingsService` is injected into the
  webhook dispatcher, Baileys manager, and account service so changes apply live.

## See also

- [Admin Console](admin-console.md)
- [Security & Auth](security-auth.md)
