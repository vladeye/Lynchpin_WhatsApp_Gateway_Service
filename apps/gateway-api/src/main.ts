import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createLogger } from "./utils/logger";
import { getPool } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { PgAccountRepository } from "./stores/account.repository";
import { PgMessageRepository } from "./stores/message.repository";
import { PgWebhookRepository } from "./stores/webhook.repository";
import { WebhookDispatcher } from "./services/webhook-dispatch.service";
import { BaileysManager } from "./services/baileys-manager.service";
import { MediaStore } from "./services/media-store.service";
import { AccountService } from "./services/account.service";
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

  const webhook = new WebhookDispatcher(webhookRepo, {
    baseUrl: config.N8N_WEBHOOK_BASE_URL,
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
    logger,
  });

  const accountService = new AccountService(
    accountRepo,
    messageRepo,
    manager,
    config.SESSION_ROOT,
    mediaStore,
  );

  const lifecycle = new SessionLifecycle(accountRepo, manager, logger);
  const restored = await lifecycle.restoreAll();
  if (restored) logger.info({ restored }, "restoring sessions");

  const app = await buildApp({
    logger: true,
    deps: { accountService, webhookRepo, config },
  });

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    logger.info({ port: config.PORT }, "gateway-api listening");
  } catch (err) {
    logger.error(err, "failed to start gateway-api");
    process.exit(1);
  }
}

void main();
