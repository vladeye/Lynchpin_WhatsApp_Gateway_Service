import { z } from "zod";

/**
 * Environment configuration. Secrets are optional in this foundation build so
 * the app and tests can boot without them; later milestones tighten these to
 * required once the Baileys/webhook code that consumes them lands.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3010),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  GATEWAY_API_KEY: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  // Console authentication (single admin). The admin is seeded on first boot.
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(168),
  DATABASE_URL: z.string().optional(),
  SESSION_ROOT: z.string().default("/app/sessions"),
  MEDIA_ROOT: z.string().default("/app/sessions/media"),
  N8N_WEBHOOK_BASE_URL: z.string().optional(),
  MAX_TEXT_LENGTH: z.coerce.number().int().positive().default(4096),
  // Corporate this gateway acts for. A corporate may own many WhatsApp
  // accounts; each account belongs to exactly one corporate. Stamped onto
  // every event so Odoo can resolve the tenant. Single-corporate for now.
  COMPANY_KEY: z.string().default("default"),
  // Outbox dispatcher: how often to drain, batch size, and how many attempts
  // before a delivery is marked dead.
  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(2000),
  OUTBOX_BATCH: z.coerce.number().int().positive().default(20),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
