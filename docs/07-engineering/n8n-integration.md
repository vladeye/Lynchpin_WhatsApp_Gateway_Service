# n8n Integration (Gateway ⇄ n8n ⇄ Odoo)

## Status

In progress — Slice 0 (handshake) active. `apps/gateway-api`
(`webhook-dispatch.service`, boot handshake in `main.ts`) + the Odoo module
`appointment_communications_wa` + the n8n workflow "WA - gateway - Odoo".

## Architecture

The gateway is **transport-only** and its only network peer is **n8n**. It
*emits facts* (a message happened) and *executes commands* (send / change route);
it never decides business rules. n8n validates, normalizes and fans out. **Odoo**
is the system of record and owns every routing/business decision.

```
WhatsApp ⇄ Gateway ──events──▶ n8n ──▶ Odoo
                   ◀─commands── n8n ◀──
```

- **Events vs commands.** Inbound + status are fire-and-forget events; outbound +
  route changes are commands that come back through n8n. Nothing decisional is
  returned inline on the inbound call.
- **Multi-tenant.** Each WhatsApp account belongs to exactly one corporate; a
  corporate may own many accounts. The gateway stamps `company_key`; Odoo
  resolves `company_id` authoritatively and is never sent a trusted `company_id`.
- **Delivery.** At-least-once, with Odoo dedup on `external_message_id`.

## Path convention

n8n hosts versioned ingress paths; the gateway picks the path per event type
(`pathForEvent` in `webhook-dispatch.service.ts`):

| Direction | Path | Carries |
|---|---|---|
| Gateway → n8n | `POST /webhook/wa/v1/gateway/inbound` | messages, lifecycle, **handshake** |
| Gateway → n8n | `POST /webhook/wa/v1/gateway/status` | delivery/read/failed receipts |
| Odoo → n8n | `POST /webhook/wa/v1/odoo/outbound` | message to send |
| Odoo → n8n | `POST /webhook/wa/v1/odoo/command` | route control |
| n8n → Gateway | `POST /api/messages/send`, `/api/routes` | commands (bearer) |
| n8n → Odoo | `POST /communications/wa/{handshake,inbound,status,mirror}` | bearer |

There is deliberately **no `…/gateway/mirror`** path — mirroring is n8n fan-out,
not a gateway behaviour.

## Handshake (Slice 0)

On boot, after migrations + session restore, the gateway emits a
`gateway.handshake` event `{ company_key, gateway_version }` to the inbound
ingress. n8n ("WA - gateway - Odoo") forwards it to Odoo's
`/communications/wa/handshake`, which authenticates the bearer and echoes the
identity back. The round-trip is recorded as a delivery row in the **Logs** feed.

## Security

- **Gateway → n8n:** HMAC `X-Webhook-Signature` over the body, keyed by
  `WEBHOOK_SECRET`.
- **n8n → Odoo:** `Authorization: Bearer` keyed by `ODOO_WHATSAPP_WEBHOOK_SECRET`
  (system param `communications_wa.webhook_secret`, env fallback).
- **n8n → Gateway:** `GATEWAY_API_TOKEN` (lands with M2).

## Config

- `COMPANY_KEY` — corporate this gateway acts for (single-corporate for now).
- `N8N_WEBHOOK_BASE_URL` / Parameters `n8n_webhook_base_url` — e.g.
  `https://n8n-developer-01.doctorapiesitos.com/webhook`.
- `WEBHOOK_SECRET` — gateway→n8n HMAC key.

## See also

- [Admin Console](admin-console.md) — the Logs feed that records deliveries.
- [Security & Authentication](security-auth.md)
