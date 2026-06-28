import "server-only";
import { logger } from "@/lib/logger";

/**
 * ab-store — contadores de A/B testing del hero (Brandon 2026-06-28, audit #13).
 * Persistencia en Upstash Redis (cross-instance) con fallback in-memory para dev
 * sin Redis. Claves: ab:<slug>:<variant>:<event> (variant A|B, event view|click).
 * Bajo volumen, INCR atómico. No requiere migración de schema.
 */
let _redis: import("@upstash/redis").Redis | null = null;
let _resolved = false;

async function getRedis(): Promise<import("@upstash/redis").Redis | null> {
  if (_resolved) return _redis;
  _resolved = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { _redis = null; return null; }
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

const _mem = new Map<string, number>();
const key = (slug: string, variant: string, event: string) => `ab:${slug}:${variant}:${event}`;

export type AbVariant = "A" | "B";
export type AbEvent = "view" | "click";
export interface AbStats { A: { views: number; clicks: number }; B: { views: number; clicks: number } }

export async function abIncr(slug: string, variant: AbVariant, event: AbEvent): Promise<void> {
  const k = key(slug, variant, event);
  const r = await getRedis();
  if (r) {
    try { await r.incr(k); return; }
    catch (err) { logger.warn("[ab-store] incr falló, uso memoria", { error: String(err) }); }
  }
  _mem.set(k, (_mem.get(k) ?? 0) + 1);
}

export async function abStats(slug: string): Promise<AbStats> {
  const r = await getRedis();
  const read = async (variant: AbVariant, event: AbEvent): Promise<number> => {
    const k = key(slug, variant, event);
    if (r) {
      try { return Number(await r.get(k)) || 0; }
      catch { return _mem.get(k) ?? 0; }
    }
    return _mem.get(k) ?? 0;
  };
  return {
    A: { views: await read("A", "view"), clicks: await read("A", "click") },
    B: { views: await read("B", "view"), clicks: await read("B", "click") },
  };
}
