import type { FastifyInstance } from "fastify";
import type { WebhookRepository } from "../stores/types";

interface EventsQuery {
  limit?: string;
  offset?: string;
  event_type?: string;
  status?: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** Logs feed: filtered, paginated gateway events from the delivery log. */
export function eventsRoutes(repo: WebhookRepository, kick?: () => void) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.get<{ Querystring: EventsQuery }>("/api/events", async (req) => {
      const limit = clamp(Number(req.query.limit) || 50, 1, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const filter = {
        limit,
        offset,
        eventType: req.query.event_type || undefined,
        status: req.query.status || undefined,
      };
      const [events, total, eventTypes] = await Promise.all([
        repo.list(filter),
        repo.count(filter),
        repo.distinctEventTypes(),
      ]);
      return {
        success: true,
        events,
        total,
        limit,
        offset,
        event_types: eventTypes,
      };
    });

    app.get<{ Params: { id: string } }>("/api/events/:id", async (req, reply) => {
      const detail = await repo.getById(req.params.id);
      if (!detail) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Event not found" },
        });
      }
      return { success: true, event: detail };
    });

    // Replay: re-queue a delivery (pending, attempts reset) and nudge the worker.
    // Consumers dedup, so re-delivering a delivered event is safe.
    app.post<{ Params: { id: string } }>(
      "/api/events/:id/redeliver",
      async (req, reply) => {
        const ok = await repo.redeliver(req.params.id);
        if (!ok) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "Event not found" },
          });
        }
        kick?.();
        return { success: true };
      },
    );
  };
}
