import { describe, expect, it } from "vitest";
import { RouteService } from "../src/services/route.service";
import { InMemoryRouteRepository } from "../src/stores/memory";
import type { RouteCommand } from "@lynchpin-whatsapp-gateway/shared-types";

function svc() {
  return new RouteService(new InMemoryRouteRepository());
}

const base = { gateway_account_id: "a1", chat_id: "c1" };

describe("RouteService", () => {
  it("defaults to odoo/active for an unrouted conversation", async () => {
    expect(await svc().routeFor("a1", "c1")).toEqual({
      owner: "odoo",
      status: "active",
    });
  });

  it("change_route sets the owner and (re)activates", async () => {
    const s = svc();
    const route = await s.executeCommand({
      ...base,
      command: "change_route",
      owner: "rush",
    } as RouteCommand);
    expect(route.owner).toBe("rush");
    expect(route.status).toBe("active");
    expect(await s.routeFor("a1", "c1")).toEqual({
      owner: "rush",
      status: "active",
    });
  });

  it("pause/resume toggle status while preserving the owner", async () => {
    const s = svc();
    await s.executeCommand({ ...base, command: "change_route", owner: "rush" } as RouteCommand);

    const paused = await s.executeCommand({ ...base, command: "pause" } as RouteCommand);
    expect(paused).toMatchObject({ owner: "rush", status: "paused" });

    const resumed = await s.executeCommand({ ...base, command: "resume" } as RouteCommand);
    expect(resumed).toMatchObject({ owner: "rush", status: "active" });
  });

  it("close marks the conversation closed but keeps the owner", async () => {
    const s = svc();
    await s.executeCommand({ ...base, command: "change_route", owner: "rush" } as RouteCommand);
    const closed = await s.executeCommand({ ...base, command: "close" } as RouteCommand);
    expect(closed).toMatchObject({ owner: "rush", status: "closed" });
  });

  it("change_route after close reactivates", async () => {
    const s = svc();
    await s.executeCommand({ ...base, command: "close" } as RouteCommand);
    const route = await s.executeCommand({
      ...base,
      command: "change_route",
      owner: "odoo",
    } as RouteCommand);
    expect(route).toMatchObject({ owner: "odoo", status: "active" });
  });
});
