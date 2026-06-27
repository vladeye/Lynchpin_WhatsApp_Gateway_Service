import type { FastifyInstance, FastifyReply } from "fastify";
import { RouteCommandSchema } from "@lynchpin-whatsapp-gateway/shared-types";
import type { RouteService } from "../services/route.service";

/**
 * Route commands from Odoo (via n8n): change_route / pause / resume / close.
 * Guarded by the auth-guard (X-Gateway-Api-Key). The gateway executes the
 * command into its owner cache; it never decides ownership itself.
 */
export function routesRoutes(service: RouteService) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.post("/api/routes", async (req, reply: FastifyReply) => {
      const parsed = RouteCommandSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: { code: "INVALID_REQUEST", message: "Invalid route command" },
        });
      }
      const route = await service.executeCommand(parsed.data);
      return { success: true, route };
    });
  };
}
