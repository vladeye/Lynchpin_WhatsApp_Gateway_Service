import type { FastifyInstance, FastifyReply } from "fastify";
import { UpdateSettingSchema } from "@lynchpin-whatsapp-gateway/shared-types";
import {
  SettingValidationError,
  type SettingsService,
} from "../services/settings.service";

function fail(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.code(status).send({ success: false, error: { code, message } });
}

/** Effective configuration (read-only) plus editable runtime settings. */
export function parametersRoutes(settings: SettingsService) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.get("/api/parameters", async () => ({
      success: true,
      effective: settings.effective(),
      settings: settings.describe(),
    }));

    app.put("/api/parameters", async (req, reply) => {
      const parsed = UpdateSettingSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, 400, "INVALID_REQUEST", "key and value required");
      }
      try {
        await settings.set(parsed.data.key, parsed.data.value);
      } catch (err) {
        if (err instanceof SettingValidationError) {
          return fail(reply, 400, "INVALID_SETTING", err.message);
        }
        throw err;
      }
      return { success: true, settings: settings.describe() };
    });
  };
}
