import { z } from "zod";

/** Lifecycle states of a gateway WhatsApp account. */
export const AccountStateSchema = z.enum([
  "created",
  "waiting_qr",
  "waiting_code",
  "connecting",
  "connected",
  "disconnected",
  "logged_out",
  "error",
]);
export type AccountState = z.infer<typeof AccountStateSchema>;

/** Public representation of an account returned by the API. */
export const AccountSchema = z.object({
  id: z.string(),
  external_account_id: z.string(),
  name: z.string(),
  state: AccountStateSchema,
  phone_number: z.string().nullable(),
  display_name: z.string().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  last_connected_at: z.string().nullable(),
});
export type Account = z.infer<typeof AccountSchema>;

/** Status payload (adds the transient QR string while waiting). */
export const AccountStatusSchema = AccountSchema.extend({
  last_qr: z.string().nullable(),
});
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const CreateAccountSchema = z.object({
  external_account_id: z.string().min(1),
  name: z.string().min(1),
});
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

export const ConnectCodeSchema = z.object({
  phone_number: z.string().min(5),
});
export type ConnectCodeInput = z.infer<typeof ConnectCodeSchema>;

export const SendMessageSchema = z.object({
  request_id: z.string().min(1),
  gateway_account_id: z.string().min(1),
  chat_id: z.string().min(1),
  type: z.literal("text").default("text"),
  text: z.string().min(1).max(4096),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

/** A row in the Logs event feed (backed by webhook deliveries). */
export const EventLogItemSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  gateway_account_id: z.string().nullable(),
  status: z.string(),
  attempts: z.number(),
  message: z.string().nullable(),
  created_at: z.string(),
});
export type EventLogItem = z.infer<typeof EventLogItemSchema>;
