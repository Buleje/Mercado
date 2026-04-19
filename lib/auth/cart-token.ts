/**
 * lib/auth/cart-token.ts
 *
 * HMAC-SHA256 signed tokens that gate anonymous-but-identifiable access
 * to `GET/PUT/DELETE /api/cart/[phone]`.
 *
 * The customer is not logged in, but they are identifiable by their phone
 * number. A signed token binds a specific phone + tenantId to proof-of-ownership
 * so that an attacker cannot iterate phone numbers and harvest carts, and so
 * that a token issued by Tenant A cannot be replayed against Tenant B
 * (RED-009 — red-team-checkout-security.md).
 *
 * Issuance flow:
 *   1. Server issues the token on a trusted surface — checkout confirmation
 *      page, WhatsApp deeplink, post-order email — via `signCartToken(tenantId, phone)`.
 *   2. Client stores the token next to the phone (localStorage, deeplink
 *      query param) and presents it as `?token=...` on every cart call.
 *   3. Server verifies with `verifyCartToken(tenantId, phone, token)` in constant time.
 *
 * The helper fails closed: if `AUTH_SECRET` is missing or malformed, every
 * verification returns false. The caller must surface a 404 on failure to
 * avoid leaking an existence oracle.
 *
 * Breaking change note: adding tenantId to the HMAC scope invalidates all
 * tokens issued before this change. This is intentional — it forces
 * re-authentication and closes the cross-tenant token reuse vector.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const DOMAIN_PREFIX = "cart";
const MIN_SECRET_LENGTH = 16;

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    return null;
  }
  return secret;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function computeDigest(
  secret: string,
  tenantId: string,
  phone: string,
): string {
  return createHmac("sha256", secret)
    .update(`${DOMAIN_PREFIX}:${tenantId}:${normalizePhone(phone)}`)
    .digest("hex");
}

/**
 * Produce a signed token for the given tenant + phone. Throws if `AUTH_SECRET`
 * is not configured — callers should only invoke this on trusted server
 * surfaces where the secret is guaranteed to exist.
 */
export function signCartToken(tenantId: string, phone: string): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign cart tokens");
  }
  return computeDigest(secret, tenantId, phone);
}

/**
 * Constant-time verification of a presented token against the expected
 * HMAC for the given tenant + phone. Never throws — returns false on any
 * failure mode (missing secret, wrong type, wrong length, bad bytes, mismatch).
 */
export function verifyCartToken(
  tenantId: string,
  phone: string,
  token: unknown,
): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  const secret = getSecret();
  if (!secret) return false;

  try {
    const expected = computeDigest(secret, tenantId, phone);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(token, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
