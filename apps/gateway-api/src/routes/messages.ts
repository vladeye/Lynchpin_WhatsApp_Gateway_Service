import type { FastifyInstance, FastifyReply } from "fastify";
import { SendMessageSchema } from "@lynchpin-whatsapp-gateway/shared-types";
import {
  AccountNotConnectedError,
  AccountNotFoundError,
  MessageTooLongError,
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
        if (err instanceof MessageTooLongError) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "MESSAGE_TOO_LONG",
              message: "Message exceeds the configured max text length",
            },
          });
        }
        throw err;
      }
    });

    app.post("/api/messages/send-media", async (req, reply: FastifyReply) => {
      const fields: Record<string, string> = {};
      let buffer: Buffer | null = null;
      let filename: string | null = null;
      let mimetype: string | null = null;

      try {
        for await (const part of req.parts()) {
          if (part.type === "file") {
            filename = part.filename ?? null;
            mimetype = part.mimetype ?? null;
            buffer = await part.toBuffer();
          } else {
            fields[part.fieldname] = String(part.value);
          }
        }
      } catch {
        return reply.code(413).send({
          success: false,
          error: { code: "FILE_TOO_LARGE", message: "Attachment exceeds 64 MB" },
        });
      }

      const { request_id, gateway_account_id, chat_id, caption } = fields;
      if (!buffer || !request_id || !gateway_account_id || !chat_id) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "file, request_id, gateway_account_id and chat_id required",
          },
        });
      }

      try {
        const result = await service.sendMediaMessage({
          request_id,
          gateway_account_id,
          chat_id,
          buffer,
          mimetype,
          filename,
          caption: caption || null,
        });
        return { success: true, request_id, ...result };
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
