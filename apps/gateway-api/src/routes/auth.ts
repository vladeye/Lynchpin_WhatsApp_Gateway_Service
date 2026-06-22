import type { FastifyInstance, FastifyReply } from "fastify";
import {
  ChangePasswordSchema,
  LoginSchema,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type { AuthService } from "../services/auth.service";
import type { SettingsService } from "../services/settings.service";
import { serializeCookie, SESSION_COOKIE } from "../utils/cookie";

export interface AuthRoutesOptions {
  /** Secure cookie flag (true in production / behind HTTPS). */
  secureCookie: boolean;
}

function fail(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.code(status).send({ success: false, error: { code, message } });
}

export function authRoutes(
  authService: AuthService,
  settings: SettingsService,
  options: AuthRoutesOptions,
) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.post("/api/auth/login", async (req, reply) => {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, 400, "INVALID_REQUEST", "username and password required");
      }
      const token = await authService.login(
        parsed.data.username,
        parsed.data.password,
      );
      if (!token) {
        return fail(reply, 401, "INVALID_CREDENTIALS", "Invalid username or password");
      }
      reply.header(
        "set-cookie",
        serializeCookie(SESSION_COOKIE, token, {
          httpOnly: true,
          secure: options.secureCookie,
          sameSite: "Lax",
          path: "/",
          maxAge: authService.tokenTtlSeconds,
        }),
      );
      return { success: true, user: { username: parsed.data.username } };
    });

    app.post("/api/auth/logout", async (_req, reply) => {
      reply.header(
        "set-cookie",
        serializeCookie(SESSION_COOKIE, "", {
          httpOnly: true,
          secure: options.secureCookie,
          sameSite: "Lax",
          path: "/",
          maxAge: 0,
        }),
      );
      return { success: true };
    });

    // Protected by the global auth guard; echoes the authenticated admin.
    app.get("/api/auth/me", async (req) => ({
      success: true,
      user: { username: req.user?.username ?? "unknown" },
    }));

    app.post("/api/auth/change-password", async (req, reply) => {
      const parsed = ChangePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(
          reply,
          400,
          "INVALID_REQUEST",
          "new_password must be at least 8 characters",
        );
      }
      const username = req.user?.username;
      if (!username || username === "api-key") {
        return fail(reply, 403, "FORBIDDEN", "Not a password-based session");
      }
      const ok = await authService.changePassword(
        username,
        parsed.data.current_password,
        parsed.data.new_password,
      );
      if (!ok) {
        return fail(reply, 400, "INVALID_CREDENTIALS", "Current password is wrong");
      }
      return { success: true };
    });

    app.get("/api/security", async (req) => ({
      success: true,
      security: {
        username: req.user?.username ?? "unknown",
        api_key_configured: Boolean(settings.apiKey()),
        api_key_hint: settings.apiKeyHint(),
        webhook_signing: settings.webhookSigning(),
      },
    }));

    app.post("/api/security/rotate-api-key", async () => {
      const apiKey = await settings.rotateApiKey();
      return { success: true, api_key: apiKey };
    });
  };
}
