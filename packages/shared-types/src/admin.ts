import { z } from "zod";
import { EventLogItemSchema } from "./accounts";

/** Full detail of a single Logs event (payload + delivery diagnostics). */
export const EventLogDetailSchema = EventLogItemSchema.extend({
  gateway_account_id: z.string().nullable(),
  payload: z.unknown(),
  last_error: z.string().nullable(),
  target_url: z.string().nullable(),
  delivered_at: z.string().nullable(),
});
export type EventLogDetail = z.infer<typeof EventLogDetailSchema>;

/** Admin login credentials. */
export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** The authenticated admin returned to the console. */
export const AdminUserSchema = z.object({
  username: z.string(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

/** Editable runtime setting keys (persisted, overriding env defaults). */
export const SETTING_KEYS = [
  "max_text_length",
  "log_level",
  "n8n_webhook_base_url",
  "sync_full_history",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** A single editable setting as shown on the Parameters screen. */
export const SettingItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["number", "string", "boolean", "select"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  /** Whether the current value comes from the DB (overridden) or env default. */
  overridden: z.boolean(),
  options: z.array(z.string()).optional(),
});
export type SettingItem = z.infer<typeof SettingItemSchema>;

export const UpdateSettingSchema = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type UpdateSettingInput = z.infer<typeof UpdateSettingSchema>;

/** Parameters screen payload: read-only effective config + editable settings. */
export const ParametersResponseSchema = z.object({
  effective: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  settings: z.array(SettingItemSchema),
});
export type ParametersResponse = z.infer<typeof ParametersResponseSchema>;

/** Security screen: API key state (never exposes the secret itself). */
export const SecurityInfoSchema = z.object({
  username: z.string(),
  api_key_configured: z.boolean(),
  api_key_hint: z.string().nullable(),
  webhook_signing: z.boolean(),
});
export type SecurityInfo = z.infer<typeof SecurityInfoSchema>;
