# developer-01 environment

## Status

Active — the gateway's first deployed environment.

## Where it runs

- Host: shared server `86.48.17.29` (SSH alias `staging`, root).
- Path: `/opt/appointment-platform/developer-01/lynchpin-whatsapp-gateway`
  (a clone of this repo, `main`).
- URL: `https://dev01-gateway.doctorapiesitos.com` → nginx → `127.0.0.1:3010`.
- The host runs Node 18, so the service always runs in the Node 24 Docker image.

## Stack (Docker Compose)

`deploy/developer-01/docker-compose.yml` (project
`lynchpin-whatsapp-gateway-developer-01`, isolated from the Odoo/n8n stack):

- `gateway-api` — Fastify + Baileys + the built console, on `127.0.0.1:3010`.
- `db` — `postgres:16`, internal to the stack (no host port), data under
  `./data/postgres`. Migrations run on gateway-api boot.
- Baileys sessions under `./data/sessions` (volume) so they survive restarts.

## Deploy / redeploy

```bash
cd /opt/appointment-platform/developer-01/lynchpin-whatsapp-gateway
git pull
cp deploy/developer-01/.env.example deploy/developer-01/.env   # first time only
# set POSTGRES_PASSWORD + matching DATABASE_URL, GATEWAY_API_KEY, WEBHOOK_SECRET
docker compose -f deploy/developer-01/docker-compose.yml up -d --build
```

Reverse proxy and SSL are managed by system nginx + certbot (see `deploy/`).

## Notes

- The `/api` surface is currently unauthenticated within this environment.
- n8n for developer-01 lives at `n8n-developer-01.doctorapiesitos.com`
  (`127.0.0.1:5681`); set `N8N_WEBHOOK_BASE_URL` accordingly.
