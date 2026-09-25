import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";

/**
 * TrustedDevicesDB — dispositivos de confianza para SALTAR el 2FA (ADR-304).
 *
 * Modelo de seguridad (importante):
 *  - Un dispositivo de confianza salta SOLO el segundo factor (TOTP). El
 *    password SIEMPRE se pide y se verifica antes de mirar la confianza — una
 *    cookie robada NO es un bypass total, sólo evita el código de la app.
 *  - El secreto (256 bits) vive únicamente en la cookie httpOnly; en la DB
 *    guardamos sólo su SHA-256. La cookie es `${id}.${secret}`.
 *  - Revocable (revoke / revokeAll) y con expiración dura (30 días). Cambiar la
 *    contraseña o desactivar 2FA revoca TODOS los dispositivos de la cuenta.
 *  - Persistencia en `PlatformSetting` (KV) — sin migración de schema.
 *
 * `tenantId` 1er argumento (aislamiento multi-tenant). Clave namespaced por
 * tenant+username: una cookie de confianza jamás cruza de cuenta.
 */

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const MAX_DEVICES = 10; // cap anti-acumulación por cuenta
const KEY = (tenantId: string, username: string) => `trusted-devices:${tenantId}:${username}`;

export type TrustedDeviceRecord = {
  id: string; // id público (va en la cookie, sirve para lookup + revoke)
  secretHash: string; // SHA-256 del secreto; el secreto NO se persiste
  label: string; // "Chrome · Windows" derivado del user-agent
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
};

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Compara dos hex-strings del mismo largo en tiempo constante. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export const TrustedDevicesDB = {
  /**
   * Emite un dispositivo de confianza y devuelve el token para la cookie
   * (`${id}.${secret}`). Poda expirados y respeta el cap MAX_DEVICES.
   */
  async issue(tenantId: string, username: string, label: string, now: Date): Promise<string> {
    const id = randomBytes(16).toString("hex");
    const secret = randomBytes(32).toString("hex");
    const record: TrustedDeviceRecord = {
      id,
      secretHash: sha256(secret),
      label: label.slice(0, 80),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
      lastUsedAt: now.toISOString(),
    };
    const list = await this.list(tenantId, username, now);
    // Nuevos al final; si supera el cap, se cae el más viejo.
    const next = [...list, record].slice(-MAX_DEVICES);
    await PlatformSettingsDB.set(KEY(tenantId, username), next, `login:${username}`);
    return `${id}.${secret}`;
  },

  /**
   * Verifica el token de la cookie contra los registros vigentes. Si matchea,
   * refresca `lastUsedAt` y devuelve true. No revela por qué falló.
   */
  async verify(tenantId: string, username: string, token: string, now: Date): Promise<boolean> {
    const dot = token.indexOf(".");
    if (dot <= 0) return false;
    const id = token.slice(0, dot);
    const secret = token.slice(dot + 1);
    if (!id || !secret) return false;

    const list = await this.list(tenantId, username, now);
    const rec = list.find((d) => d.id === id);
    if (!rec) return false;
    if (!safeEqualHex(sha256(secret), rec.secretHash)) return false;

    rec.lastUsedAt = now.toISOString();
    await PlatformSettingsDB.set(KEY(tenantId, username), list, `login:${username}`);
    return true;
  },

  /** Lista los dispositivos vigentes (poda expirados). Para verify y para la UI. */
  async list(tenantId: string, username: string, now: Date): Promise<TrustedDeviceRecord[]> {
    const raw = (await PlatformSettingsDB.get<TrustedDeviceRecord[]>(KEY(tenantId, username))) ?? [];
    if (!Array.isArray(raw)) return [];
    const ts = now.getTime();
    return raw.filter((d) => d && typeof d.expiresAt === "string" && new Date(d.expiresAt).getTime() > ts);
  },

  /** Revoca un dispositivo puntual por id. */
  async revoke(tenantId: string, username: string, id: string, now: Date): Promise<void> {
    const list = await this.list(tenantId, username, now);
    await PlatformSettingsDB.set(
      KEY(tenantId, username),
      list.filter((d) => d.id !== id),
      `login:${username}`,
    );
  },

  /** Revoca TODOS los dispositivos de la cuenta (cambio de clave / disable 2FA). */
  async revokeAll(tenantId: string, username: string): Promise<void> {
    await PlatformSettingsDB.set(KEY(tenantId, username), [], `login:${username}`);
  },
};

/** Nombre de la cookie httpOnly que guarda el token del dispositivo de confianza. */
export const TRUSTED_DEVICE_COOKIE = "buleje-trusted-device";
export const TRUSTED_DEVICE_MAX_AGE = Math.floor(TTL_MS / 1000);

/** Deriva una etiqueta legible ("Chrome · Windows") de un user-agent. Best-effort. */
export function deviceLabelFromUA(ua: string | null): string {
  if (!ua) return "Dispositivo desconocido";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Navegador";
  const os = /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return os ? `${browser} · ${os}` : browser;
}
