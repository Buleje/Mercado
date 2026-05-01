/**
 * Super-admin platform session (separate from per-tenant admin sessions).
 * Uses a distinct cookie so it never conflicts with tenant sessions.
 * Edge-compatible — no Node.js-only imports.
 *
 * Capas de seguridad:
 *   1. HMAC-SHA256 sobre payload + expiración (8 h máx).
 *   2. Idle timeout — 30 min sin actividad → token inválido.
 *   3. UA fingerprint binding — el token es válido sólo para el user-agent
 *      con el que se emitió. Cambio brusco (sesión robada y replay) → reject.
 */

const PLATFORM_COOKIE = "buleje-platform-sess";
const DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours hard cap
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min inactivity

export interface PlatformSession {
  username: string;
  /** absolute expiration (ms epoch) */
  exp: number;
  /** last activity (ms epoch) — refreshed on each authenticated request */
  lastSeen: number;
  /** SHA-256 hash (base64url, 16 chars) del User-Agent al iniciar sesión */
  uaHash: string;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET required — add to .env");
  }
  return secret;
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

/**
 * Hash determinístico del User-Agent (16 chars base64). Permite atar el
 * token al cliente sin almacenar el UA completo en el cookie. Si el UA
 * llega ausente, hasheamos el string vacío — el binding sigue siendo
 * consistente en clientes sin UA (p. ej. tests internos).
 */
export async function hashUA(ua: string | null | undefined): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(ua ?? ""));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).slice(0, 16);
}

export async function createPlatformToken(
  username: string,
  ua: string | null | undefined,
): Promise<string> {
  const now = Date.now();
  const session: PlatformSession = {
    username,
    exp: now + DURATION_MS,
    lastSeen: now,
    uaHash: await hashUA(ua),
  };
  const payload = b64e(JSON.stringify(session));
  const sig = await sign(getSecret(), payload);
  return `${payload}.${sig}`;
}

interface VerifyOpts {
  ua?: string | null;
}

/**
 * Verifica firma + expiración + idle + UA. Devuelve la sesión si todo
 * pasa. Cualquier fallo silencioso → null.
 */
export async function getPlatformSession(
  token: string,
  opts: VerifyOpts = {},
): Promise<PlatformSession | null> {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!(await verify(getSecret(), payload, sig))) return null;
    const data = JSON.parse(b64d(payload)) as PlatformSession;

    // 1. Hard expiration
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;

    // 2. Idle timeout (sólo si el campo existe — backward compat con
    // tokens emitidos antes del binding; esos caducan en 8 h por exp).
    if (typeof data.lastSeen === "number") {
      if (Date.now() - data.lastSeen > IDLE_TIMEOUT_MS) return null;
    }

    // 3. UA binding (sólo si el campo existe en el token y nos pasaron
    // un UA para comparar). Backward compat con tokens previos.
    if (data.uaHash && typeof opts.ua !== "undefined") {
      const incoming = await hashUA(opts.ua ?? null);
      if (incoming !== data.uaHash) return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Re-emite el token actualizando `lastSeen` y opcionalmente rotando si
 * está cerca de expirar. Devuelve un token fresco listo para reescribir
 * en el cookie, o null si la sesión no es válida.
 */
export async function maybeRotateToken(
  token: string,
  opts: VerifyOpts = {},
): Promise<string | null> {
  const session = await getPlatformSession(token, opts);
  if (!session) return null;

  const now = Date.now();
  const remaining = session.exp - now;
  const idle = now - (session.lastSeen ?? now);

  // Rotamos si pasó la mitad de la vida útil O si llevamos >5 min sin
  // actualizar lastSeen (para que el idle timeout sea efectivo).
  const needsRotation = remaining < DURATION_MS / 2 || idle > 5 * 60 * 1000;
  if (!needsRotation) return null;

  // Nueva sesión: refresca lastSeen y exp; mantiene uaHash original.
  const refreshed: PlatformSession = {
    username: session.username,
    exp: now + DURATION_MS,
    lastSeen: now,
    uaHash: session.uaHash,
  };
  const payload = b64e(JSON.stringify(refreshed));
  const sig = await sign(getSecret(), payload);
  return `${payload}.${sig}`;
}

export const PLATFORM_SESSION = {
  COOKIE_NAME: PLATFORM_COOKIE,
  MAX_AGE: Math.floor(DURATION_MS / 1000),
  IDLE_TIMEOUT_MS,
} as const;
