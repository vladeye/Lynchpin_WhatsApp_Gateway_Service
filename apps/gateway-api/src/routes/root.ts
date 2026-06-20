import type { FastifyInstance } from "fastify";

/**
 * Service index. Returns a small identity/status payload so hitting the bare
 * domain shows something useful instead of a 404.
 */
export async function rootRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async () => ({
    service: "lynchpin-whatsapp-gateway",
    status: "ok" as const,
    endpoints: ["/health", "/ready"],
  }));
}
