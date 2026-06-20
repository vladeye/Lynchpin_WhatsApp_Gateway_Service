import { describe, expect, it } from "vitest";
import {
  EVENT_MESSAGE_RECEIVED,
  EVENT_MESSAGE_UNSUPPORTED,
  GatewayEventSchema,
} from "@wa-gateway/shared-types";
import {
  dedupKey,
  normalizeInbound,
  type BaileysMessage,
} from "../src/services/normalizer";

const FIXED = {
  eventId: "evt_test_1",
  occurredAt: "2026-06-20T20:15:01.000Z",
};

const TS_ISO = "2026-06-20T20:15:00.000Z";
const TS_EPOCH = Math.floor(Date.parse(TS_ISO) / 1000);

function textMessage(overrides: Partial<BaileysMessage> = {}): BaileysMessage {
  return {
    key: { remoteJid: "573001112233@s.whatsapp.net", id: "BAE5ABC", fromMe: false },
    message: { conversation: "Hola, quiero una cita" },
    pushName: "Maria",
    messageTimestamp: TS_EPOCH,
    ...overrides,
  };
}

describe("normalizeInbound", () => {
  it("normalizes a text message into a message.received envelope", () => {
    const event = normalizeInbound("acc_001", textMessage(), FIXED);

    expect(event).toEqual({
      event_id: "evt_test_1",
      event: EVENT_MESSAGE_RECEIVED,
      gateway_account_id: "acc_001",
      occurred_at: "2026-06-20T20:15:01.000Z",
      payload: {
        conversation: {
          chat_id: "573001112233@s.whatsapp.net",
          is_group: false,
          contact_phone: "573001112233",
          contact_name: "Maria",
          push_name: "Maria",
        },
        message: {
          wa_message_id: "BAE5ABC",
          direction: "inbound",
          type: "text",
          text: "Hola, quiero una cita",
          timestamp: TS_ISO,
        },
      },
    });
  });

  it("produces a schema-valid event", () => {
    const event = normalizeInbound("acc_001", textMessage(), FIXED);
    expect(GatewayEventSchema.safeParse(event).success).toBe(true);
  });

  it("reads text from extendedTextMessage", () => {
    const event = normalizeInbound(
      "acc_001",
      textMessage({ message: { extendedTextMessage: { text: "con formato" } } }),
      FIXED,
    );
    expect(event).toMatchObject({
      event: EVENT_MESSAGE_RECEIVED,
      payload: { message: { text: "con formato" } },
    });
  });

  it("marks group chats", () => {
    const event = normalizeInbound(
      "acc_001",
      textMessage({
        key: {
          remoteJid: "12036304@g.us",
          participant: "573009998877@s.whatsapp.net",
          id: "BAE6",
        },
      }),
      FIXED,
    );
    expect(event).toMatchObject({
      payload: {
        conversation: { is_group: true, contact_phone: "573009998877" },
      },
    });
  });

  it("falls back to message.unsupported for non-text types", () => {
    const event = normalizeInbound(
      "acc_001",
      textMessage({ message: { imageMessage: { url: "x" } } as never }),
      FIXED,
    );
    expect(event).toEqual({
      event_id: "evt_test_1",
      event: EVENT_MESSAGE_UNSUPPORTED,
      gateway_account_id: "acc_001",
      occurred_at: "2026-06-20T20:15:01.000Z",
      payload: {
        message_type: "imageMessage",
        reason: "unsupported_message_type",
      },
    });
  });
});

describe("dedupKey", () => {
  it("combines account id and wa message id", () => {
    expect(dedupKey("acc_001", "BAE5ABC")).toBe("acc_001:BAE5ABC");
  });

  it("differs across accounts for the same message id", () => {
    expect(dedupKey("acc_001", "BAE5")).not.toBe(dedupKey("acc_002", "BAE5"));
  });
});
