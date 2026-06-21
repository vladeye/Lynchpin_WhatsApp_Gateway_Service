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
  DATABASE_URL: z.string().optional(),
  SESSION_ROOT: z.string().default("/app/sessions"),
  MEDIA_ROOT: z.string().default("/app/sessions/media"),
  N8N_WEBHOOK_BASE_URL: z.string().optional(),
  MAX_TEXT_LENGTH: z.coerce.number().int().positive().default(4096),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
