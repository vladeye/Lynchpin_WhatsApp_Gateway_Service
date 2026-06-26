import {
  DEFAULT_OWNER,
  DEFAULT_ROUTE_STATUS,
  type ConversationRoute,
  type RouteCommand,
  type RouteStatus,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type { RouteRepository } from "../stores/types";

/**
 * Owns the conversation route cache. The gateway never decides ownership — it
 * records Odoo's commands and answers "who owns this conversation?" so inbound
 * events can be stamped. Unknown conversations default to odoo/active.
 */
export class RouteService {
  constructor(private readonly repo: RouteRepository) {}

  /** Apply a routing command, returning the resulting route. Last-write-wins. */
  async executeCommand(cmd: RouteCommand): Promise<ConversationRoute> {
    const current = await this.repo.getRoute(
      cmd.gateway_account_id,
      cmd.chat_id,
    );
    let owner = current?.owner ?? DEFAULT_OWNER;
    let status: RouteStatus = current?.status ?? DEFAULT_ROUTE_STATUS;

    switch (cmd.command) {
      case "change_route":
        // Schema guarantees owner is present for change_route. Routing to an
        // owner (re)activates the conversation.
        owner = cmd.owner ?? owner;
        status = "active";
        break;
      case "pause":
        status = "paused";
        break;
      case "resume":
        status = "active";
        break;
      case "close":
        status = "closed";
        break;
    }

    return this.repo.setRoute(
      cmd.gateway_account_id,
      cmd.chat_id,
      owner,
      status,
    );
  }

  /** Cached owner + status for a conversation; defaults when never routed. */
  async routeFor(
    gatewayAccountId: string,
    chatId: string,
  ): Promise<{ owner: string; status: RouteStatus }> {
    const route = await this.repo.getRoute(gatewayAccountId, chatId);
    return {
      owner: route?.owner ?? DEFAULT_OWNER,
      status: route?.status ?? DEFAULT_ROUTE_STATUS,
    };
  }
}
