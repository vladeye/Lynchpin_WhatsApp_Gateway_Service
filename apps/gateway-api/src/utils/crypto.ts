import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign a raw JSON body for the `X-Webhook-Signature` header sent to n8n.
 * Returns a value of the form `sha256=<hex>`.
 */
export function hmacSign(body: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

/**
 * Constant-time verification of a signature produced by {@link hmacSign}.
 */
export function verifySignature(
  body: string,
  secret: string,
  signature: string,
): boolean {
  const expected = Buffer.from(hmacSign(body, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}
