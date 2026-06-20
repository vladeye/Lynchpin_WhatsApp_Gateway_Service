# Lynchpin WhatsApp Gateway — gateway-api container.
# The backend is ESM TypeScript run directly via tsx (no build step yet); the
# admin-web frontend is built with Vite and served by gateway-api as static
# files. Host servers run Node 18, so the service always runs in this Node 24
# image.
FROM node:24-slim

ENV PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH

WORKDIR /app

RUN corepack enable

# Install dependencies first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/gateway-api/package.json apps/gateway-api/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
RUN pnpm install --frozen-lockfile

# Copy the rest of the workspace and build the frontend.
COPY . .
RUN pnpm --filter @lynchpin-whatsapp-gateway/admin-web build

ENV NODE_ENV=production
EXPOSE 3010

CMD ["pnpm", "--filter", "@lynchpin-whatsapp-gateway/gateway-api", "start"]
