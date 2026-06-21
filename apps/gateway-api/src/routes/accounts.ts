import type { FastifyInstance, FastifyReply } from "fastify";
import {
  ConnectCodeSchema,
  CreateAccountSchema,
} from "@lynchpin-whatsapp-gateway/shared-types";
import {
  AccountExistsError,
  AccountNotFoundError,
  type AccountService,
} from "../services/account.service";

function fail(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  return reply.code(status).send({ success: false, error: { code, message } });
}

interface IdParams {
  id: string;
}

export function accountsRoutes(service: AccountService) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.get("/api/accounts", async () => ({
      success: true,
      accounts: await service.list(),
    }));

    app.post("/api/accounts", async (req, reply) => {
      const parsed = CreateAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return fail(reply, 400, "INVALID_REQUEST", "Invalid account payload");
      }
      try {
        const account = await service.create(parsed.data);
        return reply.code(201).send({ success: true, account });
      } catch (err) {
        if (err instanceof AccountExistsError) {
          return fail(reply, 409, "ACCOUNT_EXISTS", "external_account_id in use");
        }
        throw err;
      }
    });

    const withAccount =
      (
        handler: (id: string, reply: FastifyReply, body: unknown) => Promise<unknown>,
      ) =>
      async (req: { params: IdParams; body?: unknown }, reply: FastifyReply) => {
        try {
          return await handler(req.params.id, reply, req.body);
        } catch (err) {
          if (err instanceof AccountNotFoundError) {
            return fail(reply, 404, "ACCOUNT_NOT_FOUND", "Account not found");
          }
          throw err;
        }
      };

    app.get<{ Params: IdParams }>(
      "/api/accounts/:id",
      withAccount(async (id) => ({ success: true, account: await service.status(id) })),
    );

    app.get<{ Params: IdParams }>(
      "/api/accounts/:id/status",
      withAccount(async (id) => ({ success: true, account: await service.status(id) })),
    );

    app.get<{ Params: IdParams }>(
      "/api/accounts/:id/chats",
      withAccount(async (id) => ({ success: true, chats: await service.listChats(id) })),
    );

    app.get<{ Params: { id: string; chatId: string } }>(
      "/api/accounts/:id/chats/:chatId/messages",
      async (req, reply) => {
        try {
          const messages = await service.listMessages(
            req.params.id,
            decodeURIComponent(req.params.chatId),
          );
          return { success: true, messages };
        } catch (err) {
          if (err instanceof AccountNotFoundError) {
            return fail(reply, 404, "ACCOUNT_NOT_FOUND", "Account not found");
          }
          throw err;
        }
      },
    );

    app.post<{ Params: IdParams }>(
      "/api/accounts/:id/connect/qr",
      withAccount(async (id) => ({ success: true, account: await service.connectQr(id) })),
    );

    app.post<{ Params: IdParams }>(
      "/api/accounts/:id/connect/code",
      withAccount(async (id, reply, body) => {
        const parsed = ConnectCodeSchema.safeParse(body);
        if (!parsed.success) {
          return fail(reply, 400, "INVALID_REQUEST", "phone_number required");
        }
        const result = await service.connectCode(id, parsed.data.phone_number);
        return { success: true, ...result };
      }),
    );

    app.post<{ Params: IdParams }>(
      "/api/accounts/:id/disconnect",
      withAccount(async (id, _reply, body) => {
        const logout = Boolean((body as { logout?: boolean } | undefined)?.logout);
        return { success: true, account: await service.disconnect(id, logout) };
      }),
    );

    app.post<{ Params: IdParams }>(
      "/api/accounts/:id/reconnect",
      withAccount(async (id) => ({ success: true, account: await service.reconnect(id) })),
    );

    app.delete<{ Params: IdParams }>(
      "/api/accounts/:id",
      withAccount(async (id) => {
        await service.remove(id);
        return { success: true };
      }),
    );
  };
}
