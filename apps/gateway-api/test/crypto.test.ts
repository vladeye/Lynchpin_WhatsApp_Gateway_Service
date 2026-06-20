import { describe, expect, it } from "vitest";
import { hmacSign, verifySignature } from "../src/utils/crypto";

describe("hmacSign", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ event: "message.received", id: 1 });

  it("is deterministic for the same body and secret", () => {
    expect(hmacSign(body, secret)).toBe(hmacSign(body, secret));
  });

  it("produces the sha256= prefixed hex form", () => {
    expect(hmacSign(body, secret)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("changes when the body changes", () => {
    expect(hmacSign(body, secret)).not.toBe(hmacSign(body + " ", secret));
  });

  it("changes when the secret changes", () => {
    expect(hmacSign(body, secret)).not.toBe(hmacSign(body, "other-secret"));
  });
});

describe("verifySignature", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ event: "message.received", id: 1 });

  it("accepts a valid signature", () => {
    const sig = hmacSign(body, secret);
    expect(verifySignature(body, secret, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = hmacSign(body, secret);
    expect(verifySignature(body + "tampered", secret, sig)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = hmacSign(body, secret);
    expect(verifySignature(body, "wrong-secret", sig)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifySignature(body, secret, "sha256=deadbeef")).toBe(false);
  });
});
