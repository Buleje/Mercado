/**
 * customer-tier-cache — fetcher cacheado para /api/marketplace/customer-tier.
 *
 * Problema que resuelve (Brandon 2026-05-31): el endpoint tiene rate-limit
 * STRICT (anti-enumeración, seguridad). Varios componentes (ClienteFrecuenteBadge
 * en el navbar persistente + TierDiscountBanner en checkout) lo llamaban SIN
 * cache ni dedup → cada remount (y Fast Refresh dispara muchos) pegaba de nuevo
 * → 429 Too Many Requests.
 *
 * Solución: cache por teléfono en sessionStorage (sobrevive Fast Refresh y
 * navegación SPA) + dedup de requests en vuelo + back-off corto en fallo.
 * NO debilita el rate-limit del server.
 *
 * Client-only: las funciones solo corren en el browser (se llaman dentro de
 * useEffect). No usar en server components.
 */

export interface CustomerTier {
  level: "frecuente" | "vip" | "embajador";
  label: string;
  discountPct: number;
}

export interface TierResult {
  tier: CustomerTier | null;
  count: number;
}

const TTL_OK = 5 * 60_000; // 5 min en éxito (matchea Cache-Control del server)
const TTL_EMPTY = 60_000; // 60s en fallo/sin-tier → back-off anti-spam (429/401)
const PREFIX = "buleje:tier:";

const EMPTY: TierResult = { tier: null, count: 0 };

// Dedup de requests concurrentes para el mismo teléfono.
const inflight = new Map<string, Promise<TierResult>>();

function readCache(phone: string): TierResult | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + phone);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; ttl: number; data: TierResult };
    if (Date.now() - parsed.at > parsed.ttl) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(phone: string, data: TierResult, ttl: number) {
  try {
    sessionStorage.setItem(
      PREFIX + phone,
      JSON.stringify({ at: Date.now(), ttl, data }),
    );
  } catch {
    /* private browsing / quota — ignorar */
  }
}

/**
 * Devuelve el tier del cliente, cacheado. Siempre resuelve (nunca rechaza):
 * ante error/401/429 devuelve `{ tier: null, count: 0 }` y back-off 60s.
 */
export async function fetchCustomerTier(phone: string): Promise<TierResult> {
  const key = phone.trim();
  if (key.length < 6) return EMPTY;

  const cached = readCache(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async (): Promise<TierResult> => {
    try {
      const r = await fetch(
        `/api/marketplace/customer-tier?phone=${encodeURIComponent(key)}`,
        { credentials: "include" },
      );
      if (!r.ok) {
        writeCache(key, EMPTY, TTL_EMPTY); // 429/401/etc → back-off corto
        return EMPTY;
      }
      const json = (await r.json()) as Partial<TierResult>;
      const data: TierResult = { tier: json.tier ?? null, count: json.count ?? 0 };
      writeCache(key, data, data.tier ? TTL_OK : TTL_EMPTY);
      return data;
    } catch {
      writeCache(key, EMPTY, TTL_EMPTY);
      return EMPTY;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

/** Invalida el cache de un teléfono (ej. tras completar un pedido). */
export function invalidateCustomerTier(phone: string) {
  try {
    sessionStorage.removeItem(PREFIX + phone.trim());
  } catch {
    /* ignore */
  }
}
