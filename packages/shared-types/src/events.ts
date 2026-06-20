import { z } from "zod";

/**
 * Stable event contract emitted by the gateway to n8n.
 *
 * The gateway is transport-only: it converts raw WhatsApp/Baileys events into
 * these normalized envelopes. n8n / Ruler / AI decide what they mean.
 */

export const EVENT_MESSAGE_RECEIVED = "message.received" as const;
export const EVENT_MESSAGE_UNSUPPORTED = "message.unsupported" as const;

/** Conversation (chat) the event belongs to. */
export const ConversationSchema = z.object({
  chat_id: z.string().min(1),
  is_group: z.boolean(),
  contact_phone: z.string().min(1),
  contact_name: z.string().nullable(),
  push_name: z.string().nullable(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/** Message direction relative to the gateway. */
export const DirectionSchema = z.enum(["inbound", "outbound"]);
export type Direction = z.infer<typeof DirectionSchema>;

/** Supported inbound message types (v0.1 handles text; more come later). */
export const InboundMessageSchema = z.object({
  wa_message_id: z.string().min(1),
  direction: z.literal("inbound"),
  type: z.literal("text"),
  text: z.string().nullable(),
  timestamp: z.string().datetime(),
});
export type InboundMessage = z.infer<typeof InboundMessageSchema>;

export const MessageReceivedPayloadSchema = z.object({
  conversation: ConversationSchema,
  message: InboundMessageSchema,
});
export type MessageReceivedPayload = z.infer<typeof MessageReceivedPayloadSchema>;

export const MessageUnsupportedPayloadSchema = z.object({
  message_type: z.string(),
  reason: z.string(),
});
export type MessageUnsupportedPayload = z.infer<typeof MessageUnsupportedPayloadSchema>;

/** Common envelope wrapping every event sent to n8n. */
const envelopeBase = {
  event_id: z.string().min(1),
  gateway_account_id: z.string().min(1),
  occurred_at: z.string().datetime(),
};

export const MessageReceivedEventSchema = z.object({
  ...envelopeBase,
  event: z.literal(EVENT_MESSAGE_RECEIVED),
  payload: MessageReceivedPayloadSchema,
});
export type MessageReceivedEvent = z.infer<typeof MessageReceivedEventSchema>;

export const MessageUnsupportedEventSchema = z.object({
  ...envelopeBase,
  event: z.literal(EVENT_MESSAGE_UNSUPPORTED),
  payload: MessageUnsupportedPayloadSchema,
});
export type MessageUnsupportedEvent = z.infer<typeof MessageUnsupportedEventSchema>;

/** Any event the gateway can emit. */
export const GatewayEventSchema = z.discriminatedUnion("event", [
  MessageReceivedEventSchema,
  MessageUnsupportedEventSchema,
]);
export type GatewayEvent = z.infer<typeof GatewayEventSchema>;
