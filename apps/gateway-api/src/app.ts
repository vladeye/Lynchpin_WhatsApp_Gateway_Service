import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { healthRoutes } from "./routes/health";
import { apiRoutes } from "./routes/api";

export interface BuildAppOptions {
  logger?: boolean;
  /** Directory of the built admin-web frontend. Defaults to apps/admin-web/dist. */
  staticDir?: string;
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
