import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { healthRoutes } from "./routes/health";
import { apiRoutes } from "./routes/api";
import { accountsRoutes } from "./routes/accounts";
import { messagesRoutes } from "./routes/messages";
import { eventsRoutes } from "./routes/events";
import { parametersRoutes } from "./routes/parameters";
import { authRoutes } from "./routes/auth";
import { registerAuthGuard } from "./plugins/auth-guard";
import type { AccountService } from "./services/account.service";
import type { AuthService } from "./services/auth.service";
import type { SettingsService } from "./services/settings.service";
import type { WebhookRepository } from "./stores/types";
import type { Config } from "./config";

export interface AppDeps {
  accountService: AccountService;
  authService: AuthService;
  settings: SettingsService;
  webhookRepo: WebhookRepository;
  config: Config;
  /** Kick the outbox worker (used by the redeliver endpoint). */
  outboxKick?: () => void;
}

export interface BuildAppOptions {
  logger?: boolean;
  /** Directory of the built admin-web frontend. Defaults to apps/admin-web/dist. */
  staticDir?: string;
  /** API service dependencies. When omitted, only health/api/static are served. */
  deps?: AppDeps;
}

function defaultStaticDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../admin-web/dist");
}

/**
 * Construct the Fastify app. Routes are registered here so tests can use
 * `app.inject()` without binding a network port. When the built frontend is
 * present it is served at `/` with a SPA fallback; the API stays under
 * `/api`, `/health`, `/ready`.
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(apiRoutes);
  await app.register(healthRoutes);

  if (options.deps) {
    const { accountService, authService, settings, webhookRepo, config, outboxKick } =
      options.deps;
    registerAuthGuard(app, authService, settings);
    await app.register(
      authRoutes(authService, settings, {
        secureCookie: config.NODE_ENV === "production",
      }),
    );
    await app.register(accountsRoutes(accountService));
    await app.register(messagesRoutes(accountService));
    await app.register(eventsRoutes(webhookRepo, outboxKick));
    await app.register(parametersRoutes(settings));
  }

  const distDir = options.staticDir ?? defaultStaticDir();
  if (existsSync(path.join(distDir, "index.html"))) {
    await app.register(fastifyStatic, { root: distDir });

    // SPA fallback: serve index.html for non-API GETs so client routes work.
    app.setNotFoundHandler((req, reply) => {
      const isApi =
        req.url.startsWith("/api") ||
        req.url.startsWith("/health") ||
        req.url.startsWith("/ready");
      if (req.method === "GET" && !isApi) {
        return reply.type("text/html").sendFile("index.html");
      }
      return reply.code(404).send({
        message: `Route ${req.method}:${req.url} not found`,
        error: "Not Found",
        statusCode: 404,
      });
    });
  }

  return app;
}
