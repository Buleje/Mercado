/**
 * lib/auth/customer-session.ts
 *
 * Separate session system for store customers (NOT admin users).
 * Uses the same HMAC-SHA256 approach as lib/session.ts but with:
 *   - Different cookie name (buleje-customer-sess)
 *   - Different payload structure (CustomerPayload)
 *   - Longer expiry (30 days vs 15 min for admin access tokens)
 *   - Different secret derivation (AUTH_SECRET + "-customer" suffix)
 *
 * Does NOT import "server-only" — must remain edge-compatible (middleware).
 */

const CUSTOMER_COOKIE = "buleje-customer-sess";
const CUSTOMER_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CustomerPayload {
  customerId?: string; // Customer.phone — may be undefined if not yet linked
  email: string;
  name: string;
  tenantId: string;
  provider: string; // "google", "facebook", "apple", "email"
}

// ── Internal crypto helpers (same pattern as lib/session.ts) ──

function getCustomerSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET environment variable is required in production");
    }
    return "buleje-dev-fallback-2024-change-in-production-customer";
  }
  // Derive a separate secret for customer tokens so admin and customer
  // tokens are cryptographically independent.
  return secret + "-customer";
}

async function signHmac(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(raw);
}

async function verifyHmac(
  secret: string,
  data: string,
  sigB64: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    const rawSig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, rawSig, enc.encode(data));
  } catch {
    return false;
  }
}

function b64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64Decode(str: string): string {
  return decodeURIComponent(escape(atob(str)));
}

// ── Public API ──

/**
 * Create a signed customer session token (30-day expiry).
 */
export async function createCustomerToken(
  payload: CustomerPayload,
): Promise<string> {
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + CUSTOMER_SESSION_MS,
  });
  const encoded = b64Encode(data);
  const rawSig = await signHmac(getCustomerSecret(), encoded);
  const sig = btoa(String.fromCharCode(...rawSig));
  return `${encoded}.${sig}`;
}

/**
 * Verify and decode a customer session token.
 * Returns null if invalid, tampered, or expired.
 */
export async function getCustomerPayload(
  token: string,
): Promise<CustomerPayload | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;

    const encoded = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);

    if (!(await verifyHmac(getCustomerSecret(), encoded, sig))) return null;

    const raw = JSON.parse(b64Decode(encoded)) as {
      customerId?: string;
      email: string;
      name: string;
      tenantId: string;
      provider: string;
      exp: number;
    };

    if (raw.exp < Date.now()) return null;
    if (!raw.email || !raw.tenantId || !raw.provider) return null;

    return {
      customerId: raw.customerId,
      email: raw.email,
      name: raw.name,
      tenantId: raw.tenantId,
      provider: raw.provider,
    };
  } catch {
    return null;
  }
}

/**
 * Cookie configuration constants for customer sessions.
 */
export const CUSTOMER_SESSION = {
  COOKIE_NAME: CUSTOMER_COOKIE,
  MAX_AGE: Math.floor(CUSTOMER_SESSION_MS / 1000), // 30 days in seconds
} as const;
