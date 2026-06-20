import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createLogger } from "./utils/logger";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const app = await buildApp({ logger: true });

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    logger.info({ port: config.PORT }, "gateway-api listening");
  } catch (err) {
    logger.error(err, "failed to start gateway-api");
    process.exit(1);
  }
}

void main();
