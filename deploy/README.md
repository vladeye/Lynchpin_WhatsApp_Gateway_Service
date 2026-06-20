# Deployment

The WhatsApp Gateway runs as a Docker Compose stack behind the shared server's
system Nginx + Certbot reverse proxy.

## developer-01

- Domain: `dev01-gateway.doctorapiesitos.com` -> `127.0.0.1:3010`
- Install path: `/opt/appointment-platform/developer-01/whatsapp-gateway`
- Host node is too old to run the app directly; it always runs in the Node 24
  Docker image (`../Dockerfile`).

### First deploy

```bash
# On the server (ssh as root):
git clone https://github.com/vladeye/Lynchpin_WhatsApp_Gateway_Service.git \
  /opt/appointment-platform/developer-01/whatsapp-gateway
cd /opt/appointment-platform/developer-01/whatsapp-gateway

cp deploy/developer-01/.env.example deploy/developer-01/.env
# Fill GATEWAY_API_KEY and WEBHOOK_SECRET, e.g. `openssl rand -hex 32`.

docker compose -f deploy/developer-01/docker-compose.yml up -d --build
curl -fsS http://127.0.0.1:3010/health   # -> {"status":"ok"}
```

### Reverse proxy + SSL

```bash
cp deploy/nginx/wa-gateway-developers.conf.example \
  /etc/nginx/sites-available/wa-gateway
ln -sf /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/wa-gateway
nginx -t && systemctl reload nginx

certbot --nginx -d dev01-gateway.doctorapiesitos.com
nginx -t && systemctl reload nginx
curl -fsS https://dev01-gateway.doctorapiesitos.com/health
```

### Redeploy

```bash
cd /opt/appointment-platform/developer-01/whatsapp-gateway
git pull
docker compose -f deploy/developer-01/docker-compose.yml up -d --build
```

### Stop / rollback

```bash
docker compose -f deploy/developer-01/docker-compose.yml down
# Reverse proxy: remove the sites-enabled/wa-gateway symlink, reload nginx.
```
