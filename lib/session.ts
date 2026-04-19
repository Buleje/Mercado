/**
 * Minimal stateless session using HMAC-SHA256 signed tokens.
 * Works in both Node.js runtime (API routes) and Edge runtime (middleware).
 * Does NOT import "server-only" — must remain edge-compatible.
 *
 * Token strategy:
 *   - Access token  (buleje-admin-sess):    short-lived (15 min), used for auth on every request
 *   - Refresh token (buleje-admin-refresh): long-lived (7 days), used only to rotate access tokens
 *   - On each refresh, BOTH tokens are rotated (refresh token rotation prevents replay)
 */

const COOKIE_NAME = "buleje-admin-sess";
const REFRESH_COOKIE_NAME = "buleje-admin-refresh";
const ACCESS_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** @deprecated Use ACCESS_DURATION_MS — kept for backward compatibility */
const _SESSION_DURATION_MS = ACCESS_DURATION_MS;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET required — add to .env");
  }
  return secret;
}

async function signHmac(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const raw = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(raw);
}

async function verifyHmac(
  secret: string,
  data: string,
  sigB64: string
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
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

export type AdminRole =
  | "admin"
  | "cajero"
  | "almacenero"
  | "proveedor"
  | "delivery"
  | "tienda_owner"
  | "owner"
  | "manager"
  | "analista";

export interface SessionPayload {
  role: AdminRole;
  username: string;
  tenantId: string;
  name?: string;
}

export async function createSessionToken(
  role: AdminRole = "admin",
  username = "admin",
  tenantId = "main",
  name = ""
): Promise<string> {
  const payload = JSON.stringify({
    role,
    username,
    tenantId,
    name,
    type: "access",
    exp: Date.now() + ACCESS_DURATION_MS,
  });
  const encoded = b64Encode(payload);
  const rawSig = await signHmac(getSecret(), encoded);
  const sig = btoa(String.fromCharCode(...rawSig));
  return `${encoded}.${sig}`;
}

/**
 * Create a long-lived refresh token (7 days).
 * Contains the same identity claims but with type "refresh" and longer expiry.
 * Used only by /api/auth/refresh to issue new access + refresh token pairs.
 */
export async function createRefreshToken(
  role: AdminRole = "admin",
  username = "admin",
  tenantId = "main",
  name = ""
): Promise<string> {
  const payload = JSON.stringify({
    role,
    username,
    tenantId,
    name,
    type: "refresh",
    exp: Date.now() + REFRESH_DURATION_MS,
  });
  const encoded = b64Encode(payload);
  const rawSig = await signHmac(getSecret(), encoded);
  const sig = btoa(String.fromCharCode(...rawSig));
  return `${encoded}.${sig}`;
}

/**
 * Verify and decode a refresh token.
 * Returns the session payload ONLY if the token is a valid refresh token (type === "refresh").
 */
export async function getRefreshPayload(token: string): Promise<SessionPayload | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const encoded = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!(await verifyHmac(getSecret(), encoded, sig))) return null;
    const payload = JSON.parse(b64Decode(encoded)) as {
      exp: number;
      role: AdminRole;
      username: string;
      tenantId?: string;
      name?: string;
      type?: string;
    };
    // MUST be a refresh token — reject access tokens used here
    if (payload.type !== "refresh") return null;
    if (!["admin", "cajero", "almacenero", "owner", "manager", "analista"].includes(payload.role)) return null;
    if (payload.exp < Date.now()) return null;
    return {
      role: payload.role,
      username: payload.username,
      tenantId: payload.tenantId ?? "main",
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string): Promise<boolean> {
  return (await getSessionPayload(token)) !== null;
}

export async function getSessionPayload(token: string): Promise<SessionPayload | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const encoded = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!(await verifyHmac(getSecret(), encoded, sig))) return null;
    const payload = JSON.parse(b64Decode(encoded)) as {
      exp: number;
      role: AdminRole;
      username: string;
      tenantId?: string;
      name?: string;
      type?: string;
    };
    // Reject refresh tokens — they must only be used via /api/auth/refresh
    if (payload.type === "refresh") return null;
    if (!["admin", "cajero", "almacenero", "owner", "manager", "analista"].includes(payload.role)) return null;
    if (payload.exp < Date.now()) return null;
    return {
      role: payload.role,
      username: payload.username,
      tenantId: payload.tenantId ?? "main",
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export const SESSION = {
  COOKIE_NAME,
  MAX_AGE: Math.floor(ACCESS_DURATION_MS / 1000),
} as const;

export const REFRESH = {
  COOKIE_NAME: REFRESH_COOKIE_NAME,
  MAX_AGE: Math.floor(REFRESH_DURATION_MS / 1000),
} as const;
