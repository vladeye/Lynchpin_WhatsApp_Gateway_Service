import { randomUUID } from "node:crypto";
import {
  EVENT_MESSAGE_RECEIVED,
  EVENT_MESSAGE_UNSUPPORTED,
  type GatewayEvent,
  type MediaDescriptor,
  type MessageType,
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

/** Shape of a Baileys media sub-message (image/video/audio/document/sticker). */
interface RawMedia {
  mimetype?: string | null;
  caption?: string | null;
  fileName?: string | null;
  fileLength?: number | string | { low?: number } | null;
}

export interface BaileysMessageContent {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null } | null;
  imageMessage?: RawMedia | null;
  videoMessage?: RawMedia | null;
  audioMessage?: RawMedia | null;
  documentMessage?: RawMedia | null;
  stickerMessage?: RawMedia | null;
  documentWithCaptionMessage?: { message?: BaileysMessageContent | null } | null;
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

/** Maps a Baileys media sub-message key to the gateway's media type. */
const MEDIA_KEYS: Record<string, MessageType> = {
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  documentMessage: "document",
  stickerMessage: "sticker",
};

/** Best-effort byte size from Baileys' fileLength (number, string, or Long). */
function toSize(value: RawMedia["fileLength"]): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object" && typeof value.low === "number") {
    return value.low;
  }
  return null;
}

interface DetectedMedia {
  type: MessageType;
  caption: string | null;
  media: MediaDescriptor;
}

/**
 * Find a media attachment in a message, unwrapping the
 * documentWithCaptionMessage container that WhatsApp uses for captioned files.
 */
function detectMedia(
  content: BaileysMessageContent | null | undefined,
): DetectedMedia | null {
  if (!content) return null;
  if (content.documentWithCaptionMessage?.message) {
    const inner = detectMedia(content.documentWithCaptionMessage.message);
    if (inner) return inner;
  }
  for (const [key, type] of Object.entries(MEDIA_KEYS)) {
    const raw = content[key] as RawMedia | null | undefined;
    if (!raw) continue;
    return {
      type,
      caption: typeof raw.caption === "string" ? raw.caption : null,
      media: {
        mimetype: typeof raw.mimetype === "string" ? raw.mimetype : null,
        filename: typeof raw.fileName === "string" ? raw.fileName : null,
        size: toSize(raw.fileLength),
      },
    };
  }
  return null;
}

function isText(content: BaileysMessageContent | null | undefined): boolean {
  return Boolean(
    content && (content.conversation != null || content.extendedTextMessage != null),
  );
}

/** First message key (used to label genuinely unsupported types). */
function firstKey(content: BaileysMessageContent | null | undefined): string {
  if (!content) return "unknown";
  return Object.keys(content)[0] ?? "unknown";
}

function toIso(timestamp: number | null | undefined): string {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Convert a raw Baileys message into the gateway's stable event envelope.
 * Text and media (image/video/audio/document/sticker) messages produce
 * `message.received`; anything still unrecognized produces `message.unsupported`
 * so the pipeline never crashes on unknown types.
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
  const content = msg.message ?? null;

  let type: MessageType;
  let text: string | null;
  let media: MediaDescriptor | null;

  if (isText(content)) {
    type = "text";
    text = extractText(content ?? {});
    media = null;
  } else {
    const detected = detectMedia(content);
    if (!detected) {
      return {
        event_id: eventId,
        event: EVENT_MESSAGE_UNSUPPORTED,
        gateway_account_id: gatewayAccountId,
        occurred_at: occurredAt,
        payload: {
          message_type: firstKey(content),
          reason: "unsupported_message_type",
        },
      };
    }
    type = detected.type;
    text = detected.caption;
    media = detected.media;
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
        type,
        text,
        media,
        timestamp: toIso(msg.messageTimestamp),
      },
    },
  };
}
