"use client";

/**
 * useMarketplaceStores — fetcher deduplicado para `/api/marketplace/stores`.
 *
 * Background:
 *   Audit 2026-05-20 reportó 50+ archivos que llaman `/api/marketplace/stores`
 *   con limit=3, 5, 10, 50, 100, 200. Algunos en la misma carga de página
 *   piden datos solapados (ej. home: limit=100 para search + limit=5 para
 *   TopStores). Cada call tarda ~500-628ms.
 *
 * Patrón:
 *   - In-flight singleton por cache key (limit + zone + category + search)
 *   - sessionStorage TTL 120s
 *   - Subset filtrado client-side: si el cache tiene N items y el caller
 *     pide N-K, se sirve slice — evita refetchear datos ya disponibles.
 *
 * Mismo template que useChat (commit del mismo sprint).
 */

import { useEffect, useState } from "react";

const CACHE_KEY_PREFIX = "buleje:stores:";
const CACHE_TTL_MS = 120 * 1000;

export interface MarketplaceStoreLite {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  cover?: string | null;
  banner?: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  description: string | null;
  [key: string]: unknown;
}

interface CachedEntry {
  data: MarketplaceStoreLite[];
  total: number;
  ts: number;
}

interface UseMarketplaceStoresOptions {
  limit?: number;
  zone?: string;
  category?: string;
  search?: string;
}

interface UseMarketplaceStoresState {
  stores: MarketplaceStoreLite[];
  total: number;
  loading: boolean;
  error: Error | null;
}

function buildCacheKey(opts: UseMarketplaceStoresOptions): string {
  const { limit = 50, zone = "", category = "", search = "" } = opts;
  return `${CACHE_KEY_PREFIX}${limit}:${zone}:${category}:${search}`;
}

function readCache(key: string): { data: MarketplaceStoreLite[]; total: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return { data: parsed.data, total: parsed.total };
  } catch {
    return null;
  }
}

function writeCache(key: string, data: MarketplaceStoreLite[], total: number): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CachedEntry = { data, total, ts: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* silencioso */
  }
}

// Singleton in-flight por cache key
const inFlight = new Map<string, Promise<{ data: MarketplaceStoreLite[]; total: number }>>();

async function fetchStoresDeduped(opts: UseMarketplaceStoresOptions): Promise<{
  data: MarketplaceStoreLite[];
  total: number;
}> {
  const { limit = 50, zone, category, search } = opts;
  const cacheKey = buildCacheKey(opts);

  // Cache HIT
  const cached = readCache(cacheKey);
  if (cached) return cached;

  // Subset hint: si existe cache con limit MAYOR, hace slice client-side
  // sin fetch (audit: home pedía limit=100 + limit=5 = 2 calls → 1 + slice).
  if (typeof window !== "undefined") {
    for (let l = limit + 1; l <= 200; l++) {
      const superCached = readCache(buildCacheKey({ ...opts, limit: l }));
      if (superCached && superCached.data.length >= limit) {
        return { data: superCached.data.slice(0, limit), total: superCached.total };
      }
    }
  }

  // In-flight HIT
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  // MISS — fetch nuevo
  const promise = (async () => {
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (zone) params.set("zone", zone);
      if (category) params.set("category", category);
      if (search) params.set("search", search);
      const res = await fetch(`/api/marketplace/stores?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return { data: [], total: 0 };
      const json = (await res.json()) as { data?: MarketplaceStoreLite[]; total?: number };
      const data = json.data ?? [];
      const total = json.total ?? data.length;
      writeCache(cacheKey, data, total);
      return { data, total };
    } catch {
      return { data: [], total: 0 };
    } finally {
      setTimeout(() => inFlight.delete(cacheKey), 0);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

export function useMarketplaceStores(
  opts: UseMarketplaceStoresOptions = {},
): UseMarketplaceStoresState {
  const cacheKey = buildCacheKey(opts);
  const [state, setState] = useState<UseMarketplaceStoresState>(() => {
    const cached = readCache(cacheKey);
    return {
      stores: cached?.data ?? [],
      total: cached?.total ?? 0,
      loading: !cached,
      error: null,
    };
  });

  useEffect(() => {
    const cached = readCache(cacheKey);
    if (cached) {
      setState({ stores: cached.data, total: cached.total, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    void fetchStoresDeduped(opts).then((result) => {
      if (cancelled) return;
      setState({
        stores: result.data,
        total: result.total,
        loading: false,
        error: null,
      });
    }).catch((e) => {
      if (cancelled) return;
      setState((s) => ({ ...s, loading: false, error: e as Error }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return state;
}

// Export el fetcher para uso fuera de React.
export { fetchStoresDeduped };
