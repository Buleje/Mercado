/**
 * Super-admin platform session (separate from per-tenant admin sessions).
 * Uses a distinct cookie so it never conflicts with tenant sessions.
 * Edge-compatible — no Node.js-only imports.
 */

const PLATFORM_COOKIE = "buleje-platform-sess";
const DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface PlatformSession {
  username: string;
  exp: number;
}

function getSecret(): string {
  return process.env.AUTH_SECRET ?? "buleje-dev-fallback-2024-change-in-production";
}

async function sign(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function verify(secret: string, data: string, sigB64: string): Promise<boolean> {
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

function b64e(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function b64d(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}

export async function createPlatformToken(username: string): Promise<string> {
  const payload = b64e(JSON.stringify({ username, exp: Date.now() + DURATION_MS }));
  const sig = await sign(getSecret(), payload);
  return `${payload}.${sig}`;
}

export async function getPlatformSession(token: string): Promise<PlatformSession | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!(await verify(getSecret(), payload, sig))) return null;
    const data = JSON.parse(b64d(payload)) as PlatformSession;
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Check if the token should be rotated (past halfway of its lifetime).
 * Returns a fresh token string if rotation is needed, or null if not.
 */
export async function maybeRotateToken(token: string): Promise<string | null> {
  const session = await getPlatformSession(token);
  if (!session) return null;
  // Rotate when past the halfway point — less than 4 hours remaining
  const remaining = session.exp - Date.now();
  if (remaining < DURATION_MS / 2) {
    return createPlatformToken(session.username);
  }
  return null;
}

export const PLATFORM_SESSION = {
  COOKIE_NAME: PLATFORM_COOKIE,
  MAX_AGE: Math.floor(DURATION_MS / 1000),
} as const;
