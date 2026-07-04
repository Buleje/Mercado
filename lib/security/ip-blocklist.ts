/**
 * lib/security/ip-blocklist.ts
 *
 * Blocklist de IPs respaldada por Upstash Redis REST (Edge + Node safe).
 * La usa el middleware para rechazar IPs baneadas y el sink de eventos para
 * auto-bloquear reincidentes.
 *
 * Fail-open: si Upstash no está configurado (dev), todo se degrada — nadie
 * queda bloqueado por blocklist (la detección de firmas inline sigue activa).
 * Nunca tira: un fallo de Redis no debe romper una request legítima.
 *
 * Claves:
 *   sec:blocked:{ip}    → JSON {reason, at, until} con TTL (el ban)
 *   sec:threat:{ip}     → contador de amenazas en ventana, con TTL (auto-ban)
 */

import { Redis } from "@upstash/redis";
import { isIpAllowed } from "@/lib/security/ip-allowlist";

export interface BlockedIp {
  ip: string;
  reason: string;
  /** ISO cuando se bloqueó. */
  at: string;
  /** Segundos restantes del ban (aprox). */
  ttl: number;
}

const BLOCK_PREFIX = "sec:blocked:";
const THREAT_PREFIX = "sec:threat:";
const PERSIST_PREFIX = "sec:persist:";

/** Máx eventos persistidos por IP por minuto (anti-inflado de ActivityLog). */
export const PERSIST_CAP_PER_MIN = 12;
const PERSIST_WINDOW_SEC = 60;

/** TTL por defecto del ban (6 h) y de la ventana de conteo (15 min). */
export const DEFAULT_BLOCK_TTL_SEC = 6 * 60 * 60;
export const THREAT_WINDOW_SEC = 15 * 60;
/** Amenazas en la ventana que disparan el auto-ban. */
export const AUTO_BLOCK_THRESHOLD = 5;

let _client: Redis | null = null;
let _resolved = false;

function client(): Redis | null {
  if (_resolved) return _client;
  _resolved = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _client = null;
    return null;
  }
  try {
    _client = new Redis({ url, token });
  } catch {
    _client = null;
  }
  return _client;
}

/** ¿Está esta IP bloqueada? Fail-open (false) si no hay Redis o hay error. */
export async function isIpBlocked(ip: string): Promise<boolean> {
  const c = client();
  if (!c || !ip || ip === "unknown") return false;
  try {
    return (await c.exists(`${BLOCK_PREFIX}${ip}`)) === 1;
  } catch {
    return false;
  }
}

/** Bloquea una IP con razón + TTL. No-op si no hay Redis. */
export async function blockIp(ip: string, reason: string, ttlSec = DEFAULT_BLOCK_TTL_SEC): Promise<void> {
  const c = client();
  if (!c || !ip || ip === "unknown") return;
  try {
    await c.set(
      `${BLOCK_PREFIX}${ip}`,
      JSON.stringify({ reason: reason.slice(0, 200), at: new Date().toISOString() }),
      { ex: ttlSec },
    );
  } catch {
    /* fail-open */
  }
}

/** Desbloquea (borra el ban). No-op si no hay Redis. */
export async function unblockIp(ip: string): Promise<void> {
  const c = client();
  if (!c || !ip) return;
  try {
    await c.del(`${BLOCK_PREFIX}${ip}`);
  } catch {
    /* fail-open */
  }
}

/** Lista las IPs actualmente bloqueadas (con razón + TTL restante). */
export async function listBlockedIps(): Promise<BlockedIp[]> {
  const c = client();
  if (!c) return [];
  try {
    const keys = await c.keys(`${BLOCK_PREFIX}*`);
    if (keys.length === 0) return [];
    const out: BlockedIp[] = [];
    for (const key of keys.slice(0, 200)) {
      const ip = key.slice(BLOCK_PREFIX.length);
      const [raw, ttl] = await Promise.all([c.get(key), c.ttl(key)]);
      let reason = "manual";
      let at = "";
      if (raw && typeof raw === "object") {
        reason = (raw as { reason?: string }).reason ?? reason;
        at = (raw as { at?: string }).at ?? "";
      } else if (typeof raw === "string") {
        try { const p = JSON.parse(raw); reason = p.reason ?? reason; at = p.at ?? ""; } catch { /* legacy */ }
      }
      out.push({ ip, reason, at, ttl: typeof ttl === "number" ? ttl : -1 });
    }
    return out.sort((a, b) => (b.at > a.at ? 1 : -1));
  } catch {
    return [];
  }
}

/**
 * Incrementa el contador de amenazas de una IP en la ventana. Devuelve el conteo
 * actual. Si cruza el umbral, el caller decide auto-bloquear. Devuelve 0 si no
 * hay Redis (auto-ban deshabilitado, pero el bloqueo inline por firma sigue).
 */
export async function bumpThreatCounter(ip: string): Promise<number> {
  const c = client();
  if (!c || !ip || ip === "unknown") return 0;
  try {
    const key = `${THREAT_PREFIX}${ip}`;
    const count = await c.incr(key);
    if (count === 1) await c.expire(key, THREAT_WINDOW_SEC);
    return count;
  } catch {
    return 0;
  }
}

/**
 * Contador de persistencia por IP en una ventana de 1 min. Devuelve el conteo
 * tras incrementar. El caller persiste el evento solo si count <= cap — así una
 * tormenta de bots no infla ActivityLog con miles de filas iguales (el
 * auto-bloqueo sigue funcionando vía el threat counter, que no se throttlea).
 * Sin Redis → devuelve 0 (siempre persiste; en dev no hay tormenta).
 */
export async function bumpPersistCounter(ip: string): Promise<number> {
  const c = client();
  if (!c || !ip || ip === "unknown") return 0;
  try {
    const key = `${PERSIST_PREFIX}${ip}`;
    const count = await c.incr(key);
    if (count === 1) await c.expire(key, PERSIST_WINDOW_SEC);
    return count;
  } catch {
    return 0;
  }
}

/** ¿Está habilitada la blocklist distribuida? (Upstash configurado) */
export function isBlocklistEnabled(): boolean {
  return client() !== null;
}

// ── IPs de confianza — nunca se bloquean ni analizan ─────────────────────────
// `WAF_TRUSTED_IPS` (IP exacta o CIDR, coma-separadas). Vacío = ninguna.
// Evita que el propio dueño/oficina se auto-bloquee por un falso positivo.
// Edge-safe: isIpAllowed es parsing puro.
let _trustedResolved = false;
let _trustedList: string[] = [];

function trustedList(): string[] {
  if (_trustedResolved) return _trustedList;
  _trustedResolved = true;
  const raw = process.env.WAF_TRUSTED_IPS ?? "";
  _trustedList = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return _trustedList;
}

export function isTrustedIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false;
  const list = trustedList();
  if (list.length === 0) return false;
  try {
    return isIpAllowed(ip, list);
  } catch {
    return false;
  }
}

/** ¿Hay IPs de confianza configuradas? (para mostrarlo en el dashboard) */
export function hasTrustedIps(): boolean {
  return trustedList().length > 0;
}
