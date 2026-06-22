import { describe, expect, it } from "vitest";
import { SettingsService, SettingValidationError } from "../src/services/settings.service";
import { InMemorySettingsRepository } from "../src/stores/memory";
import { loadConfig } from "../src/config";

function setup() {
  const repo = new InMemorySettingsRepository();
  const config = loadConfig({
    NODE_ENV: "test",
    MAX_TEXT_LENGTH: "4096",
    LOG_LEVEL: "info",
  } as NodeJS.ProcessEnv);
  return { repo, service: new SettingsService(repo, config) };
}

describe("SettingsService", () => {
  it("falls back to env defaults", async () => {
    const { service } = setup();
    await service.load();
    expect(service.maxTextLength()).toBe(4096);
    expect(service.logLevel()).toBe("info");
    expect(service.syncFullHistory()).toBe(true);
  });

  it("persists and applies an overridden value", async () => {
    const { service, repo } = setup();
    await service.load();
    await service.set("max_text_length", 100);
    expect(service.maxTextLength()).toBe(100);
    expect(await repo.get("max_text_length")).toBe("100");
    expect(service.describe().find((s) => s.key === "max_text_length")?.overridden).toBe(
      true,
    );
  });

  it("coerces booleans", async () => {
    const { service } = setup();
    await service.load();
    await service.set("sync_full_history", false);
    expect(service.syncFullHistory()).toBe(false);
  });

  it("rejects invalid values", async () => {
    const { service } = setup();
    await service.load();
    await expect(service.set("max_text_length", 99999)).rejects.toBeInstanceOf(
      SettingValidationError,
    );
    await expect(service.set("log_level", "loud")).rejects.toBeInstanceOf(
      SettingValidationError,
    );
    await expect(
      service.set("n8n_webhook_base_url", "not-a-url"),
    ).rejects.toBeInstanceOf(SettingValidationError);
  });

  it("rotates the API key", async () => {
    const { service } = setup();
    await service.load();
    const key = await service.rotateApiKey();
    expect(key).toHaveLength(48);
    expect(service.apiKey()).toBe(key);
    expect(service.apiKeyHint()).toBe(`••••${key.slice(-4)}`);
  });
});
