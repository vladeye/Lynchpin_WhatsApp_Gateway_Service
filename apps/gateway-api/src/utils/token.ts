import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HMAC-signed token (JWT-like, dependency-free). Format:
 * `base64url(payloadJson).base64url(hmacSha256)`. Used for the admin console
 * session; the same secret verifies it on later requests.
 */

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64",
  );
}

export interface TokenClaims {
  sub: string;
  /** Unix epoch seconds when the token expires. */
  exp: number;
  [key: string]: unknown;
}

function sign(body: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(body).digest());
}

/** Create a signed token for `sub`, valid for `ttlSeconds`. */
export function signToken(
  sub: string,
  secret: string,
  ttlSeconds: number,
): string {
  const claims: TokenClaims = {
    sub,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(claims));
  return `${body}.${sign(body, secret)}`;
}

/** Verify a token's signature and expiry; returns its claims or null. */
export function verifyToken(
  token: string | undefined | null,
  secret: string,
): TokenClaims | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  try {
    const claims = JSON.parse(fromB64url(body).toString("utf8")) as TokenClaims;
    if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
