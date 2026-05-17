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
// 365 días — sesión "remember me forever". Pero la seguridad real viene
// de la rotación: cada visita autenticada re-emite el token con un
// nuevo exp 365 días en el futuro (sliding expiration). Un usuario
// activo nunca tiene que volver a loguearse; uno que no vuelve en >1
// año entra de nuevo. Patrón usado por Amazon/Mercado Libre/Stripe.
const CUSTOMER_SESSION_MS = 365 * 24 * 60 * 60 * 1000;
/** Si pasó >50 % de la vida útil, rotamos al siguiente request. */
const ROTATE_THRESHOLD_MS = CUSTOMER_SESSION_MS / 2;

export interface CustomerPayload {
  customerId?: string; // Customer.phone — may be undefined if not yet linked
  email: string;
  name: string;
  tenantId: string;
  provider: string; // "google", "facebook", "apple", "email"
}

// ── Internal crypto helpers (same pattern as lib/session.ts) ──

/**
 * Audit 2026-05-17 05-P1-1: rotación multi-secret también para customer.
 * Se firma con CURRENT, se verifica con CURRENT + PREVIOUS para zero-downtime
 * rotation. Misma derivación "-customer" para mantener cripto-independencia
 * entre admin y customer tokens.
 */
function getCustomerSecretCurrent(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET required — add to .env");
  }
  return secret + "-customer";
}

function getCustomerSecretsAll(): string[] {
  const current = getCustomerSecretCurrent();
  const previous = process.env.AUTH_SECRET_PREVIOUS;
  if (previous && previous !== process.env.AUTH_SECRET) {
    return [current, previous + "-customer"];
  }
  return [current];
}

// Compat con call sites existentes — firma siempre usa current.
function getCustomerSecret(): string {
  return getCustomerSecretCurrent();
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

async function verifyHmacWithSecret(
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

/**
 * Verifica contra todos los customer secrets activos (current + previous).
 * El primer parámetro es ignorado por compatibilidad con call sites.
 */
async function verifyHmac(
  _secretIgnored: string,
  data: string,
  sigB64: string,
): Promise<boolean> {
  const secrets = getCustomerSecretsAll();
  for (const s of secrets) {
    if (await verifyHmacWithSecret(s, data, sigB64)) return true;
  }
  return false;
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
 * Si el token pasó la mitad de su vida útil, devuelve un token fresco
 * (mismo payload pero con `exp` reseteado). Si no hace falta rotar,
 * devuelve `null` y el caller mantiene el cookie actual.
 *
 * El effect compuesto: cualquier usuario que entra al storefront una
 * vez cada 6 meses se queda logueado para siempre. Sólo expira si no
 * vuelve en >365 días.
 */
export async function maybeRotateCustomerToken(
  token: string,
): Promise<string | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const encoded = token.slice(0, dotIdx);
    const raw = JSON.parse(b64Decode(encoded)) as { exp?: number };
    if (typeof raw.exp !== "number") return null;
    const remaining = raw.exp - Date.now();
    if (remaining > ROTATE_THRESHOLD_MS) return null;

    const payload = await getCustomerPayload(token);
    if (!payload) return null;
    return createCustomerToken(payload);
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
