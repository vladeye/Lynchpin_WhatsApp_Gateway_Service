import { z } from "zod";

/**
 * Conversation routing — a cache of Odoo's ownership decisions.
 *
 * The gateway never decides ownership. Odoo pushes a command (via n8n) and the
 * gateway records it, then stamps inbound events with the cached owner + status.
 */

/** Lifecycle of a routed conversation. Labels only — the gateway never gates flow. */
export const RouteStatusSchema = z.enum(["active", "paused", "closed"]);
export type RouteStatus = z.infer<typeof RouteStatusSchema>;

/** Routing commands Odoo issues to the gateway (n8n -> POST /api/routes). */
export const RouteCommandTypeSchema = z.enum([
  "change_route",
  "pause",
  "resume",
  "close",
]);
export type RouteCommandType = z.infer<typeof RouteCommandTypeSchema>;

export const RouteCommandSchema = z
  .object({
    gateway_account_id: z.string().min(1),
    chat_id: z.string().min(1),
    command: RouteCommandTypeSchema,
    // Required for change_route (the new owner label, e.g. "rush"); ignored otherwise.
    owner: z.string().min(1).optional(),
  })
  .refine((c) => c.command !== "change_route" || Boolean(c.owner), {
    message: "owner is required for change_route",
    path: ["owner"],
  });
export type RouteCommand = z.infer<typeof RouteCommandSchema>;

/** The cached route state for a conversation. */
export const ConversationRouteSchema = z.object({
  gateway_account_id: z.string().min(1),
  chat_id: z.string().min(1),
  owner: z.string().min(1),
  status: RouteStatusSchema,
  updated_at: z.string(),
});
export type ConversationRoute = z.infer<typeof ConversationRouteSchema>;

/** Default route for a conversation the gateway has never been told about. */
export const DEFAULT_OWNER = "odoo" as const;
export const DEFAULT_ROUTE_STATUS = "active" as const;
