import type { FastifyInstance } from "fastify";
import type { WebhookRepository } from "../stores/types";

interface EventsQuery {
  limit?: string;
}

/** Logs feed: recent gateway events from the webhook delivery log. */
export function eventsRoutes(repo: WebhookRepository) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.get<{ Querystring: EventsQuery }>("/api/events", async (req) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      return { success: true, events: await repo.listRecent(limit) };
    });
  };
}
