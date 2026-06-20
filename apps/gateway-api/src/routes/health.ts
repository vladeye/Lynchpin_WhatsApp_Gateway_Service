import type { FastifyInstance } from "fastify";

/**
 * Liveness and readiness endpoints. `/ready` will gain real dependency checks
 * (DB, Redis, Baileys runtime) in later milestones; for now it mirrors `/health`.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok" as const }));

  app.get("/ready", async () => ({
    status: "ready" as const,
    checks: { api: "ok" as const },
  }));
}
