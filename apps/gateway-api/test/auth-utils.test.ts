import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "../src/utils/token";
import { hashPassword, verifyPassword } from "../src/utils/password";

describe("token", () => {
  it("signs and verifies a token", () => {
    const token = signToken("admin", "secret", 3600);
    expect(verifyToken(token, "secret")?.sub).toBe("admin");
  });

  it("rejects a wrong secret", () => {
    const token = signToken("admin", "secret", 3600);
    expect(verifyToken(token, "other")).toBeNull();
  });

  it("rejects a tampered token", () => {
    const token = signToken("admin", "secret", 3600);
    expect(verifyToken(`${token}x`, "secret")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signToken("admin", "secret", -1);
    expect(verifyToken(token, "secret")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyToken(undefined, "secret")).toBeNull();
    expect(verifyToken("nope", "secret")).toBeNull();
  });
});

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("hunter2!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("hunter2!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("hunter2!");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects a malformed hash", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});
