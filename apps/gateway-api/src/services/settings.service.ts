import { randomBytes } from "node:crypto";
import type { Logger } from "pino";
import {
  SETTING_KEYS,
  type SettingItem,
  type SettingKey,
} from "@lynchpin-whatsapp-gateway/shared-types";
import type { Config } from "../config";
import type { SettingsRepository } from "../stores/types";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
const API_KEY_SETTING = "gateway_api_key";

interface SettingDef {
  key: SettingKey;
  label: string;
  type: SettingItem["type"];
  options?: string[];
}

const DEFS: SettingDef[] = [
  { key: "max_text_length", label: "Max Text Length", type: "number" },
  { key: "log_level", label: "Log Level", type: "select", options: LOG_LEVELS },
  { key: "n8n_webhook_base_url", label: "n8n Webhook Base URL", type: "string" },
  { key: "sync_full_history", label: "Sync Full History", type: "boolean" },
];

export class SettingValidationError extends Error {}

/**
 * Effective configuration: persisted runtime settings layered over environment
 * defaults. Other services read the typed getters so changes apply live.
 */
export class SettingsService {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly repo: SettingsRepository,
    private readonly config: Config,
    private readonly logger?: Logger,
  ) {}

  /** Load persisted settings into the cache and apply boot-time side effects. */
  async load(): Promise<void> {
    for (const row of await this.repo.getAll()) {
      this.cache.set(row.key, row.value);
    }
    if (this.logger) this.logger.level = this.logLevel();
  }

  maxTextLength(): number {
    const v = this.cache.get("max_text_length");
    const n = v ? Number(v) : this.config.MAX_TEXT_LENGTH;
    return Number.isFinite(n) && n > 0 ? n : this.config.MAX_TEXT_LENGTH;
  }

  logLevel(): string {
    return this.cache.get("log_level") ?? this.config.LOG_LEVEL;
  }

  n8nBaseUrl(): string | undefined {
    const v = this.cache.get("n8n_webhook_base_url");
    const resolved = v ?? this.config.N8N_WEBHOOK_BASE_URL;
    return resolved ? resolved : undefined;
  }

  syncFullHistory(): boolean {
    const v = this.cache.get("sync_full_history");
    return v == null ? true : v === "true";
  }

  /** Corporate this gateway acts for, stamped onto outgoing events. */
  companyKey(): string {
    return this.config.COMPANY_KEY;
  }

  apiKey(): string | undefined {
    return (
      this.cache.get(API_KEY_SETTING) ?? this.config.GATEWAY_API_KEY ?? undefined
    );
  }

  apiKeyHint(): string | null {
    const key = this.apiKey();
    return key ? `••••${key.slice(-4)}` : null;
  }

  webhookSigning(): boolean {
    return Boolean(this.config.WEBHOOK_SECRET);
  }

  /** Editable settings as shown on the Parameters screen. */
  describe(): SettingItem[] {
    return DEFS.map((def) => ({
      key: def.key,
      label: def.label,
      type: def.type,
      value: this.typedValue(def.key),
      overridden: this.cache.has(def.key),
      ...(def.options ? { options: def.options } : {}),
    }));
  }

  /** Read-only effective configuration (no secrets) for the Parameters screen. */
  effective(): Record<string, string | number | boolean | null> {
    return {
      environment: this.config.NODE_ENV,
      session_root: this.config.SESSION_ROOT,
      media_root: this.config.MEDIA_ROOT,
      webhook_signing: this.webhookSigning(),
      max_text_length: this.maxTextLength(),
      log_level: this.logLevel(),
      n8n_webhook_base_url: this.n8nBaseUrl() ?? null,
      sync_full_history: this.syncFullHistory(),
    };
  }

  private typedValue(key: SettingKey): string | number | boolean | null {
    switch (key) {
      case "max_text_length":
        return this.maxTextLength();
      case "log_level":
        return this.logLevel();
      case "n8n_webhook_base_url":
        return this.n8nBaseUrl() ?? null;
      case "sync_full_history":
        return this.syncFullHistory();
    }
  }

  /** Validate, persist, and apply an editable setting. */
  async set(key: SettingKey, raw: string | number | boolean): Promise<void> {
    if (!SETTING_KEYS.includes(key)) {
      throw new SettingValidationError(`Unknown setting: ${key}`);
    }
    const value = this.normalize(key, raw);
    await this.repo.set(key, value);
    this.cache.set(key, value);
    if (key === "log_level" && this.logger) this.logger.level = value;
  }

  private normalize(key: SettingKey, raw: string | number | boolean): string {
    switch (key) {
      case "max_text_length": {
        const n = Math.floor(Number(raw));
        if (!Number.isFinite(n) || n < 1 || n > 4096) {
          throw new SettingValidationError("max_text_length must be 1–4096");
        }
        return String(n);
      }
      case "log_level": {
        const v = String(raw);
        if (!LOG_LEVELS.includes(v)) {
          throw new SettingValidationError("invalid log_level");
        }
        return v;
      }
      case "n8n_webhook_base_url": {
        const v = String(raw).trim();
        if (v && !/^https?:\/\//.test(v)) {
          throw new SettingValidationError("n8n_webhook_base_url must be a URL");
        }
        return v;
      }
      case "sync_full_history":
        return String(raw === true || raw === "true");
    }
  }

  /** Generate, persist, and return a fresh gateway API key. */
  async rotateApiKey(): Promise<string> {
    const key = randomBytes(24).toString("hex");
    await this.repo.set(API_KEY_SETTING, key);
    this.cache.set(API_KEY_SETTING, key);
    return key;
  }
}
