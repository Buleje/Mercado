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

/**
 * Audit 2026-05-17 05-P1-1: rotación multi-secret.
 *
 * Antes: getSecret() retornaba AUTH_SECRET único. Si el .env filtraba,
 * TODOS los JWT (admin+customer+platform+pending-totp) eran falsificables
 * indefinidamente — sin forma de invalidar sin un deploy + rotación de
 * cookies de todos los usuarios.
 *
 * Ahora: getCurrentSecret() para firmar (siempre el nuevo), getAllSecrets()
 * para verificar (current + previous). Operación de rotación:
 *   1. Setear AUTH_SECRET_PREVIOUS = valor actual de AUTH_SECRET
 *   2. Generar nuevo AUTH_SECRET con `openssl rand -hex 32`
 *   3. Deploy → tokens viejos siguen válidos (verificados con PREVIOUS)
 *      pero nuevos tokens se firman con CURRENT.
 *   4. Tras 7+ días (max refresh window): borrar AUTH_SECRET_PREVIOUS.
 *
 * Recomendado: rotar trimestralmente o tras cualquier sospecha de leak.
 */
function getCurrentSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET required — add to .env");
  }
  return secret;
}

function getAllSecrets(): string[] {
  const current = getCurrentSecret();
  const previous = process.env.AUTH_SECRET_PREVIOUS;
  if (previous && previous !== current) {
    return [current, previous];
  }
  return [current];
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
 * Verifica una firma contra todos los secrets activos (current + previous).
 * Permite rotación zero-downtime: tokens emitidos con el secret anterior
 * siguen siendo válidos durante la ventana de overlap.
 *
 * NOTA: el primer parámetro (`secret`) se ignora en multi-secret mode;
 * el wrapper de compatibilidad acepta cualquier valor y verifica contra
 * el set completo. Si solo hay un secret, comportamiento idéntico al anterior.
 */
async function verifyHmac(
  _secretIgnored: string,
  data: string,
  sigB64: string,
): Promise<boolean> {
  const secrets = getAllSecrets();
  for (const s of secrets) {
    if (await verifyHmacWithSecret(s, data, sigB64)) return true;
  }
  return false;
}

// Compat: getSecret() llamadas a firmar siguen funcionando porque internamente
// devuelve el current. signHmac() siempre se llama con getCurrentSecret().
function getSecret(): string {
  return getCurrentSecret();
}

function b64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64Decode(str: string): string {
  return decodeURIComponent(escape(atob(str)));
}

export type AdminRole =
  | "superadmin"
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
  jti?: string;
}

export async function createSessionToken(
  role: AdminRole = "admin",
  username = "admin",
  tenantId = "main",
  name = ""
): Promise<string> {
  // SECURITY 2026-05-07 (pentest F1): jti único por access token para
  // permitir revocación inmediata en logout (blacklist en cacheStore).
  // SECURITY 2026-05-12 (pentest H004): jti usa crypto.randomUUID (CSPRNG).
  // Antes Math.random (Xorshift128+ V8) era predecible — atacante podría
  // forjar jti futuros para envenenar blacklist de revocación de tokens.
  const jti = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const payload = JSON.stringify({
    role,
    username,
    tenantId,
    name,
    type: "access",
    jti,
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
  // SECURITY 2026-05-06 (pentest H007): jti único por refresh token para
  // permitir blacklist en Redis (consumed-once semantics).
  // SECURITY 2026-05-12 (pentest H004): jti usa crypto.randomUUID (CSPRNG).
  // Antes Math.random (Xorshift128+ V8) era predecible — atacante podría
  // forjar jti futuros para envenenar blacklist de revocación de tokens.
  const jti = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const payload = JSON.stringify({
    role,
    username,
    tenantId,
    name,
    type: "refresh",
    jti,
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
      jti?: string;
    };
    // MUST be a refresh token — reject access tokens used here
    if (payload.type !== "refresh") return null;
    if (!["admin", "cajero", "almacenero", "owner", "manager", "analista", "superadmin"].includes(payload.role)) return null;
    if (payload.exp < Date.now()) return null;
    return {
      role: payload.role,
      username: payload.username,
      jti: payload.jti,
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
      jti?: string;
    };
    // Reject refresh tokens — they must only be used via /api/auth/refresh
    if (payload.type === "refresh") return null;
    if (!["admin", "cajero", "almacenero", "owner", "manager", "analista", "superadmin"].includes(payload.role)) return null;
    if (payload.exp < Date.now()) return null;
    return {
      role: payload.role,
      username: payload.username,
      jti: payload.jti,
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

// ── Pending 2FA token ─────────────────────────────────────────────────────────

export const PENDING_TOTP_COOKIE = "pending-totp";
const PENDING_TOTP_DURATION_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Emite un token de corta vida (5 min) que solo autoriza POST a
 * /api/auth/totp/verify. El rol "pending-totp" es rechazado por
 * requireAdmin, así que no da acceso al panel.
 */
export async function createPendingTotpToken(
  username: string,
  tenantId: string,
  name: string,
  role: AdminRole,
): Promise<string> {
  const payload = JSON.stringify({
    role: "pending-totp",
    username,
    tenantId,
    name,
    originalRole: role,
    type: "pending-totp",
    exp: Date.now() + PENDING_TOTP_DURATION_MS,
  });
  const encoded = b64Encode(payload);
  const rawSig = await signHmac(getSecret(), encoded);
  const sig = btoa(String.fromCharCode(...rawSig));
  return `${encoded}.${sig}`;
}

export interface PendingTotpPayload {
  username: string;
  tenantId: string;
  name: string;
  originalRole: AdminRole;
}

/**
 * Verifica y decodifica un token pending-totp.
 * Retorna null si es inválido, expirado, o no es del tipo correcto.
 */
export async function getPendingTotpPayload(
  token: string,
): Promise<PendingTotpPayload | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const encoded = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!(await verifyHmac(getSecret(), encoded, sig))) return null;
    const payload = JSON.parse(b64Decode(encoded)) as {
      exp: number;
      type?: string;
      username: string;
      tenantId: string;
      name: string;
      originalRole: AdminRole;
    };
    if (payload.type !== "pending-totp") return null;
    if (payload.exp < Date.now()) return null;
    return {
      username: payload.username,
      tenantId: payload.tenantId,
      name: payload.name,
      originalRole: payload.originalRole,
    };
  } catch {
    return null;
  }
}
