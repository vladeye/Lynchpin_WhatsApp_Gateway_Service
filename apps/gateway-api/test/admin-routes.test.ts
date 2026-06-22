import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { AccountService } from "../src/services/account.service";
import { AuthService } from "../src/services/auth.service";
import { SettingsService } from "../src/services/settings.service";
import { BaileysManager } from "../src/services/baileys-manager.service";
import { MediaStore } from "../src/services/media-store.service";
import { WebhookDispatcher } from "../src/services/webhook-dispatch.service";
import {
  InMemoryAccountRepository,
  InMemoryAdminRepository,
  InMemoryMessageRepository,
  InMemorySettingsRepository,
  InMemoryWebhookRepository,
} from "../src/stores/memory";
import { loadConfig } from "../src/config";

const SECRET = "test-secret";

async function buildTestApp() {
  const accountRepo = new InMemoryAccountRepository();
  const messageRepo = new InMemoryMessageRepository();
  const webhookRepo = new InMemoryWebhookRepository();
  const adminRepo = new InMemoryAdminRepository();
  const settingsRepo = new InMemorySettingsRepository();
  const config = loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv);

  const settings = new SettingsService(settingsRepo, config);
  await settings.load();

  const authService = new AuthService(adminRepo, { secret: SECRET, ttlSeconds: 3600 });
  await authService.seedAdmin("admin", "secret123");

  const webhook = new WebhookDispatcher(webhookRepo);
  const mediaStore = new MediaStore(path.join(tmpdir(), "lp-admin-media"));
  const manager = new BaileysManager({
    socketFactory: async () => {
      throw new Error("not used");
    },
    accountRepo,
    messageRepo,
    webhook,
    sessionRoot: path.join(tmpdir(), "lp-admin-sessions"),
    mediaStore,
  });
  const accountService = new AccountService(
    accountRepo,
    messageRepo,
    manager,
    path.join(tmpdir(), "lp-admin-sessions"),
    mediaStore,
    settings,
  );

  const app = await buildApp({
    deps: { accountService, authService, settings, webhookRepo, config },
  });
  return { app, webhookRepo, settings };
}

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : (raw as string);
  return value.split(";")[0]!;
}

describe("admin routes + auth guard", () => {
  let app: FastifyInstance;
  let webhookRepo: InMemoryWebhookRepository;
  let settings: SettingsService;

  beforeAll(async () => {
    ({ app, webhookRepo, settings } = await buildTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  it("blocks protected routes without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/events" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects bad credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("logs in, sets a cookie, and authorizes /me", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "secret123" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieFrom(login);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe("admin");
  });

  it("authorizes via API key header", async () => {
    const apiKey = await settings.rotateApiKey();
    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { "x-gateway-api-key": apiKey },
    });
    expect(res.statusCode).toBe(200);
  });

  it("filters the events feed", async () => {
    await webhookRepo.record({
      id: "e1",
      event_type: "message.received",
      gateway_account_id: "a1",
      payload: { hello: "world" },
      message: "hi",
    });
    await webhookRepo.updateStatus("e1", "delivered", 1, null, true);
    await webhookRepo.record({
      id: "e2",
      event_type: "account.connected",
      gateway_account_id: "a1",
      payload: {},
      message: null,
    });

    const cookie = await loginCookie(app);
    const filtered = await app.inject({
      method: "GET",
      url: "/api/events?event_type=message.received",
      headers: { cookie },
    });
    expect(filtered.statusCode).toBe(200);
    const body = filtered.json();
    expect(body.total).toBe(1);
    expect(body.events[0].id).toBe("e1");
    expect(body.event_types).toContain("account.connected");

    const detail = await app.inject({
      method: "GET",
      url: "/api/events/e1",
      headers: { cookie },
    });
    expect(detail.json().event.payload).toEqual({ hello: "world" });
  });

  it("reads and updates parameters", async () => {
    const cookie = await loginCookie(app);
    const put = await app.inject({
      method: "PUT",
      url: "/api/parameters",
      headers: { cookie },
      payload: { key: "max_text_length", value: 50 },
    });
    expect(put.statusCode).toBe(200);
    expect(settings.maxTextLength()).toBe(50);

    const bad = await app.inject({
      method: "PUT",
      url: "/api/parameters",
      headers: { cookie },
      payload: { key: "log_level", value: "loud" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("changes the admin password", async () => {
    const cookie = await loginCookie(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { cookie },
      payload: { current_password: "secret123", new_password: "newsecret123" },
    });
    expect(res.statusCode).toBe(200);

    const relogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "newsecret123" },
    });
    expect(relogin.statusCode).toBe(200);
  });
});

async function loginCookie(app: FastifyInstance): Promise<string> {
  // The admin password may have been rotated by an earlier test; try both.
  for (const password of ["newsecret123", "secret123"]) {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password },
    });
    if (res.statusCode === 200) return cookieFrom(res);
  }
  throw new Error("could not log in");
}
