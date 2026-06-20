import { describe, expect, it } from "vitest";
import {
  EVENT_MESSAGE_RECEIVED,
  MessageReceivedEventSchema,
} from "@wa-gateway/shared-types";

const validEvent = {
  event_id: "evt_1",
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
      wa_message_id: "BAE5",
      direction: "inbound",
      type: "text",
      text: "Hola",
      timestamp: "2026-06-20T20:15:00.000Z",
    },
  },
};

describe("MessageReceivedEventSchema", () => {
  it("accepts a well-formed event", () => {
    expect(MessageReceivedEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it("rejects an event missing the conversation", () => {
    const bad = { ...validEvent, payload: { message: validEvent.payload.message } };
    expect(MessageReceivedEventSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    const bad = {
      ...validEvent,
      payload: {
        ...validEvent.payload,
        message: { ...validEvent.payload.message, timestamp: "not-a-date" },
      },
    };
    expect(MessageReceivedEventSchema.safeParse(bad).success).toBe(false);
  });
});
