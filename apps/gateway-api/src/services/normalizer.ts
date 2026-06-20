import { randomUUID } from "node:crypto";
import {
  EVENT_MESSAGE_RECEIVED,
  EVENT_MESSAGE_UNSUPPORTED,
  type GatewayEvent,
} from "@lynchpin-whatsapp-gateway/shared-types";

/**
 * Minimal subset of a Baileys message we depend on. Kept local so the gateway
 * is not coupled to Baileys' full (and noisy) payload shape.
 */
export interface BaileysMessageKey {
  remoteJid?: string | null;
  fromMe?: boolean | null;
  id?: string | null;
  participant?: string | null;
}

export interface BaileysMessageContent {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null } | null;
  [key: string]: unknown;
}

export interface BaileysMessage {
  key: BaileysMessageKey;
  message?: BaileysMessageContent | null;
  pushName?: string | null;
  messageTimestamp?: number | null;
}

export interface NormalizeOptions {
  /** Injectable for deterministic tests; defaults to a random UUID. */
  eventId?: string;
  /** Injectable for deterministic tests; defaults to now. */
  occurredAt?: string;
}

/** Stable dedup key for an inbound WhatsApp message. */
export function dedupKey(gatewayAccountId: string, waMessageId: string): string {
  return `${gatewayAccountId}:${waMessageId}`;
}

function phoneFromJid(jid: string): string {
  const [user] = jid.split("@");
  return user ?? jid;
}

function extractText(content: BaileysMessageContent): string | null {
  if (typeof content.conversation === "string") {
    return content.conversation;
  }
  if (typeof content.extendedTextMessage?.text === "string") {
    return content.extendedTextMessage.text;
  }
  return null;
}

function detectType(content: BaileysMessageContent | null | undefined): string {
  if (!content) {
    return "unknown";
  }
  if (content.conversation != null || content.extendedTextMessage != null) {
    return "text";
  }
  const firstKey = Object.keys(content)[0];
  return firstKey ?? "unknown";
}

function toIso(timestamp: number | null | undefined): string {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Convert a raw Baileys message into the gateway's stable event envelope.
 * Text messages produce `message.received`; everything else (for now) produces
 * `message.unsupported` so the pipeline never crashes on unknown types.
 */
export function normalizeInbound(
  gatewayAccountId: string,
  msg: BaileysMessage,
  options: NormalizeOptions = {},
): GatewayEvent {
  const eventId = options.eventId ?? randomUUID();
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const remoteJid = msg.key.remoteJid ?? "";
  const isGroup = remoteJid.endsWith("@g.us");
  const senderJid = msg.key.participant ?? remoteJid;
  const type = detectType(msg.message);

  if (type !== "text") {
    return {
      event_id: eventId,
      event: EVENT_MESSAGE_UNSUPPORTED,
      gateway_account_id: gatewayAccountId,
      occurred_at: occurredAt,
      payload: {
        message_type: type,
        reason: "unsupported_message_type",
      },
    };
  }

  return {
    event_id: eventId,
    event: EVENT_MESSAGE_RECEIVED,
    gateway_account_id: gatewayAccountId,
    occurred_at: occurredAt,
    payload: {
      conversation: {
        chat_id: remoteJid,
        is_group: isGroup,
        contact_phone: phoneFromJid(senderJid),
        contact_name: msg.pushName ?? null,
        push_name: msg.pushName ?? null,
      },
      message: {
        wa_message_id: msg.key.id ?? "",
        direction: "inbound",
        type: "text",
        text: extractText(msg.message ?? {}),
        timestamp: toIso(msg.messageTimestamp),
      },
    },
  };
}
