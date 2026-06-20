# WhatsApp Gateway — gateway-api container.
# The app is ESM TypeScript run directly via tsx (no build step yet); later
# milestones may switch to a bundled dist. Host servers run Node 18, so the
# service always runs in this Node 24 image.
FROM node:24-slim

ENV NODE_ENV=production \
    PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH

WORKDIR /app

RUN corepack enable

# Install dependencies first for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/gateway-api/package.json apps/gateway-api/package.json
RUN pnpm install --frozen-lockfile

# Copy the rest of the workspace.
COPY . .

EXPOSE 3010

CMD ["pnpm", "--filter", "@lynchpin-whatsapp-gateway/gateway-api", "start"]
