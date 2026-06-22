import type { FastifyInstance } from "fastify";
import { parseCookies, SESSION_COOKIE } from "../utils/cookie";
import type { AuthService } from "../services/auth.service";
import type { SettingsService } from "../services/settings.service";

declare module "fastify" {
  interface FastifyRequest {
    user?: { username: string } | null;
  }
}

/** Endpoints reachable without authentication. */
const PUBLIC_PATHS = new Set(["/api", "/api/auth/login"]);

/**
 * Protects every `/api/*` route. Accepts either a valid session cookie (the
 * console) or the `X-Gateway-Api-Key` header (programmatic clients like n8n).
 * Non-API paths (static assets, /health, /ready) are left open.
 */
export function registerAuthGuard(
  app: FastifyInstance,
  authService: AuthService,
  settings: SettingsService,
): void {
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0] ?? "";
    if (!path.startsWith("/api")) return;
    if (PUBLIC_PATHS.has(path)) return;

    const apiKey = settings.apiKey();
    if (apiKey && req.headers["x-gateway-api-key"] === apiKey) {
      req.user = { username: "api-key" };
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const claims = authService.verify(cookies[SESSION_COOKIE]);
    if (claims) {
      req.user = claims;
      return;
    }

    return reply.code(401).send({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  });
}
