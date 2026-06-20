import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health";

export interface BuildAppOptions {
  logger?: boolean;
}

/**
 * Construct the Fastify app. Routes are registered here so tests can use
 * `app.inject()` without binding a network port.
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(healthRoutes);

  return app;
}
