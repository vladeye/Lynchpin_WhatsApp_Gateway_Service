import type { FastifyInstance, FastifyReply } from "fastify";
import { SendMessageSchema } from "@lynchpin-whatsapp-gateway/shared-types";
import {
  AccountNotConnectedError,
  AccountNotFoundError,
  type AccountService,
} from "../services/account.service";

export function messagesRoutes(service: AccountService) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.post("/api/messages/send", async (req, reply: FastifyReply) => {
      const parsed = SendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: { code: "INVALID_REQUEST", message: "Invalid message payload" },
        });
      }
      try {
        const result = await service.sendMessage(parsed.data);
        return {
          success: true,
          request_id: parsed.data.request_id,
          ...result,
        };
      } catch (err) {
        if (err instanceof AccountNotFoundError) {
          return reply.code(404).send({
            success: false,
            error: { code: "ACCOUNT_NOT_FOUND", message: "Account not found" },
          });
        }
        if (err instanceof AccountNotConnectedError) {
          return reply.code(409).send({
            success: false,
            error: {
              code: "ACCOUNT_NOT_CONNECTED",
              message: "Account is not connected",
            },
          });
        }
        throw err;
      }
    });
  };
}
