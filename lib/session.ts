/**
 * Minimal stateless session using HMAC-SHA256 signed tokens.
 * Works in both Node.js runtime (API routes) and Edge runtime (middleware).
 * Does NOT import "server-only" — must remain edge-compatible.
 */

const COOKIE_NAME = "bsm-admin-sess";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET environment variable is required in production");
    }
    return "bsm-dev-fallback-2024-change-in-production";
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

export type AdminRole = "admin" | "cajero" | "almacenero" | "owner" | "manager" | "analista";

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
    exp: Date.now() + SESSION_DURATION_MS,
  });
  const encoded = b64Encode(payload);
  const rawSig = await signHmac(getSecret(), encoded);
  const sig = btoa(String.fromCharCode(...rawSig));
  return `${encoded}.${sig}`;
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
    };
    if (!["admin", "cajero", "almacenero"].includes(payload.role)) return null;
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
  MAX_AGE: Math.floor(SESSION_DURATION_MS / 1000),
} as const;
