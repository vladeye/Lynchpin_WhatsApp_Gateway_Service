import type { FastifyInstance } from "fastify";

/**
 * API index. Service identity for programmatic clients (n8n, monitoring).
 * The browser console is served from the static frontend at `/`.
 */
export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api", async () => ({
    service: "lynchpin-whatsapp-gateway",
    status: "ok" as const,
    endpoints: ["/health", "/ready"],
  }));
}
