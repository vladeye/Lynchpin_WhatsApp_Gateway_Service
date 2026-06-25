import { EVENT_GATEWAY_HANDSHAKE } from "@lynchpin-whatsapp-gateway/shared-types";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createLogger } from "./utils/logger";
import { getPool } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { PgAccountRepository } from "./stores/account.repository";
import { PgMessageRepository } from "./stores/message.repository";
import { PgWebhookRepository } from "./stores/webhook.repository";
import { PgAdminRepository } from "./stores/admin.repository";
import { PgSettingsRepository } from "./stores/settings.repository";
import { WebhookDispatcher } from "./services/webhook-dispatch.service";
import { BaileysManager } from "./services/baileys-manager.service";
import { MediaStore } from "./services/media-store.service";
import { AccountService } from "./services/account.service";
import { AuthService } from "./services/auth.service";
import { SettingsService } from "./services/settings.service";
import { SessionLifecycle } from "./services/session-lifecycle.service";
import { createBaileysSocket } from "./services/baileys-socket";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  const pool = getPool(config.DATABASE_URL);
  const applied = await runMigrations(pool);
  if (applied.length) logger.info({ applied }, "migrations applied");

  const accountRepo = new PgAccountRepository(pool);
  const messageRepo = new PgMessageRepository(pool);
  const webhookRepo = new PgWebhookRepository(pool);
  const adminRepo = new PgAdminRepository(pool);
  const settingsRepo = new PgSettingsRepository(pool);

  const settings = new SettingsService(settingsRepo, config, logger);
  await settings.load();

  const authService = new AuthService(adminRepo, {
    secret: config.AUTH_SECRET ?? config.WEBHOOK_SECRET ?? "insecure-dev-secret",
    ttlSeconds: config.AUTH_TOKEN_TTL_HOURS * 3600,
    logger,
  });
  await authService.seedAdmin(config.ADMIN_USERNAME, config.ADMIN_PASSWORD);

  const webhook = new WebhookDispatcher(webhookRepo, {
    baseUrlProvider: () => settings.n8nBaseUrl(),
    secret: config.WEBHOOK_SECRET,
    logger,
  });

  const mediaStore = new MediaStore(config.MEDIA_ROOT);

  const manager = new BaileysManager({
    socketFactory: createBaileysSocket,
    accountRepo,
    messageRepo,
    webhook,
    sessionRoot: config.SESSION_ROOT,
    mediaStore,
    syncFullHistory: () => settings.syncFullHistory(),
    companyKey: () => settings.companyKey(),
    logger,
  });

  const accountService = new AccountService(
    accountRepo,
    messageRepo,
    manager,
    config.SESSION_ROOT,
    mediaStore,
    settings,
  );

  const lifecycle = new SessionLifecycle(accountRepo, manager, logger);
  const restored = await lifecycle.restoreAll();
  if (restored) logger.info({ restored }, "restoring sessions");

  const app = await buildApp({
    logger: true,
    deps: { accountService, authService, settings, webhookRepo, config },
  });

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    logger.info({ port: config.PORT }, "gateway-api listening");
  } catch (err) {
    logger.error(err, "failed to start gateway-api");
    process.exit(1);
  }

  // Boot handshake: prove the gateway -> n8n -> Odoo chain is reachable. Emit
  // is non-throwing and records its own delivery row in the Logs feed, so a
  // failure here never affects startup.
  await webhook.emit(
    EVENT_GATEWAY_HANDSHAKE,
    null,
    {
      company_key: settings.companyKey(),
      gateway_version: process.env.npm_package_version ?? "dev",
    },
    "boot handshake",
  );
  logger.info("boot handshake emitted");
}

void main();
