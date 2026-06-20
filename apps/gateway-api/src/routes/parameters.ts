import type { FastifyInstance } from "fastify";
import type { Config } from "../config";

/** Read-only view of effective gateway configuration (no secrets). */
export function parametersRoutes(config: Config) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.get("/api/parameters", async () => ({
      success: true,
      parameters: {
        environment: config.NODE_ENV,
        n8n_webhook_base_url: config.N8N_WEBHOOK_BASE_URL ?? null,
        webhook_signing: Boolean(config.WEBHOOK_SECRET),
        session_root: config.SESSION_ROOT,
        max_text_length: config.MAX_TEXT_LENGTH,
        log_level: config.LOG_LEVEL,
      },
    }));
  };
}
