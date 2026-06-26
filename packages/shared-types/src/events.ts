import { z } from "zod";

/**
 * Stable event contract emitted by the gateway to n8n.
 *
 * The gateway is transport-only: it converts raw WhatsApp/Baileys events into
 * these normalized envelopes. n8n / Ruler / AI decide what they mean.
 */

export const EVENT_MESSAGE_RECEIVED = "message.received" as const;
export const EVENT_MESSAGE_UNSUPPORTED = "message.unsupported" as const;
/** Delivery/read/failed receipt for one of our outbound messages. */
export const EVENT_MESSAGE_STATUS = "message.status" as const;
/** Boot-time liveness probe of the gateway -> n8n -> Odoo chain. */
export const EVENT_GATEWAY_HANDSHAKE = "gateway.handshake" as const;

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

/** Message content kinds the gateway understands. */
export const MessageTypeSchema = z.enum([
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

/** Descriptor for a media attachment carried by a message. */
export const MediaDescriptorSchema = z.object({
  mimetype: z.string().nullable(),
  filename: z.string().nullable(),
  size: z.number().nullable(),
});
export type MediaDescriptor = z.infer<typeof MediaDescriptorSchema>;

/** Supported inbound message types. Text carries `text`; media carries `media`. */
export const InboundMessageSchema = z.object({
  wa_message_id: z.string().min(1),
  direction: z.literal("inbound"),
  type: MessageTypeSchema,
  text: z.string().nullable(),
  media: MediaDescriptorSchema.nullable(),
  timestamp: z.string().datetime(),
});
export type InboundMessage = z.infer<typeof InboundMessageSchema>;

export const MessageReceivedPayloadSchema = z.object({
  conversation: ConversationSchema,
  message: InboundMessageSchema,
  // Stamped by the gateway at emit time (not by the normalizer): the corporate
  // this account acts for, and the current conversation owner ("odoo" until M5).
  company_key: z.string().nullable().optional(),
  owner: z.string().optional(),
});
export type MessageReceivedPayload = z.infer<typeof MessageReceivedPayloadSchema>;

export const MessageUnsupportedPayloadSchema = z.object({
  message_type: z.string(),
  reason: z.string(),
});
export type MessageUnsupportedPayload = z.infer<typeof MessageUnsupportedPayloadSchema>;

/** Delivery lifecycle of an outbound message, as confirmed by WhatsApp. */
export const MessageDeliveryStatusSchema = z.enum([
  "sent",
  "delivered",
  "read",
  "failed",
]);
export type MessageDeliveryStatus = z.infer<typeof MessageDeliveryStatusSchema>;

/**
 * Receipt for one of our outbound messages. Matched in Odoo by `wa_message_id`
 * (the WhatsApp id the send returned). Consumers must treat it monotonically —
 * out-of-order receipts must never regress a more-advanced state.
 */
export const MessageStatusPayloadSchema = z.object({
  company_key: z.string().nullable().optional(),
  chat_id: z.string().min(1),
  wa_message_id: z.string().min(1),
  status: MessageDeliveryStatusSchema,
  status_at: z.string().datetime(),
});
export type MessageStatusPayload = z.infer<typeof MessageStatusPayloadSchema>;

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

export const MessageStatusEventSchema = z.object({
  ...envelopeBase,
  event: z.literal(EVENT_MESSAGE_STATUS),
  payload: MessageStatusPayloadSchema,
});
export type MessageStatusEvent = z.infer<typeof MessageStatusEventSchema>;

/** Any event the gateway can emit. */
export const GatewayEventSchema = z.discriminatedUnion("event", [
  MessageReceivedEventSchema,
  MessageUnsupportedEventSchema,
  MessageStatusEventSchema,
]);
export type GatewayEvent = z.infer<typeof GatewayEventSchema>;

/**
 * Handshake payload. Carries the corporate the gateway is acting for so Odoo
 * can confirm the chain resolves a tenant. Account-less (fired before/independent
 * of any WhatsApp account), so it sits outside the message envelope union.
 */
export const GatewayHandshakePayloadSchema = z.object({
  company_key: z.string().min(1),
  gateway_version: z.string(),
});
export type GatewayHandshakePayload = z.infer<typeof GatewayHandshakePayloadSchema>;

export const GatewayHandshakeEventSchema = z.object({
  event: z.literal(EVENT_GATEWAY_HANDSHAKE),
  gateway_account_id: z.string().nullable(),
  occurred_at: z.string().datetime(),
  payload: GatewayHandshakePayloadSchema,
});
export type GatewayHandshakeEvent = z.infer<typeof GatewayHandshakeEventSchema>;
