"use client";

/**
 * useMarketplaceDeals — Hook client compartido por las secciones que
 * antes usaban `MOCK_DEALS` (home/OfertasEditorial, home/OfertasFlashSection,
 * explorar/ExplorarTileGrid, ofertas/OfertasClient).
 *
 * Fetchea desde /api/marketplace/deals con cache HTTP (60s) y dedupe
 * vía sessionStorage para no atacar el endpoint múltiples veces en
 * la misma navegación. Devuelve `Deal[]` ya adaptado al shape que
 * usaban los componentes (compatible con `lib/mock-deals.ts` Deal).
 */

import { useEffect, useState, useMemo } from "react";
import type { Deal, DealCategory } from "@/lib/mock-deals";

type ApiDeal = {
  id: string;
  productId: number;
  name: string;
  image: string | null;
  category: string;
  unit: string;
  badge: string | null;
  price: number;
  originalPrice: number | null;
  discountPct: number;
  stock: number;
  minOrderQty: number;
  store: { slug: string; name: string; logo: string | null; zone: string | null; category: string };
};

type DealsResponse = { data: ApiDeal[]; total: number; source: "deals" | "lowest" };

const CACHE_KEY = "buleje:marketplace-deals";
const CACHE_TTL_MS = 60_000;

function mapCategory(c: string): DealCategory {
  const k = c.toLowerCase();
  if (k.includes("frut") || k.includes("verdur") || k.includes("carne") || k.includes("frescos")) return "frescos";
  if (k.includes("bebida")) return "bebidas";
  if (k.includes("limpie")) return "limpieza";
  if (k.includes("lácte") || k.includes("lacte")) return "lacteos";
  if (k.includes("farma")) return "farmacia";
  return "abarrotes";
}

function adapt(d: ApiDeal): Deal {
  const previous = d.originalPrice ?? d.price;
  return {
    id: d.id,
    name: d.name,
    category: mapCategory(d.category),
    price: d.price,
    previousPrice: previous,
    discountPct: d.discountPct,
    unit: d.unit,
    storeName: d.store.name,
    storeSlug: d.store.slug,
    // Bug Hunter P1#5 fix 2026-04-30: era 24h hardcoded → countdown falso
    // de 23h59m. Ahora 7d como fallback graceful hasta que API devuelva real.
    endsAt:
      (d as { endsAt?: string }).endsAt ??
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    isFlash: d.discountPct >= 30,
    productId: d.productId,
    storeProductId: d.id,
    image: d.image,
    stock: d.stock,
  };
}

export interface UseMarketplaceDealsOptions {
  /** Si true, incluye productos de menor precio si no hay descuentos reales. */
  fallbackToLowest?: boolean;
  limit?: number;
}

export function useMarketplaceDeals(opts: UseMarketplaceDealsOptions = {}) {
  const { fallbackToLowest = false, limit = 40 } = opts;
  const cacheKey = `${CACHE_KEY}:${fallbackToLowest ? "1" : "0"}:${limit}`;

  const [deals, setDeals] = useState<Deal[]>(() => readCache(cacheKey));
  const [loading, setLoading] = useState(deals.length === 0);
  const [source, setSource] = useState<"deals" | "lowest" | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        if (fallbackToLowest) params.set("fallbackToLowest", "true");
        const res = await fetch(`/api/marketplace/deals?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DealsResponse;
        if (cancelled) return;
        const adapted = (json.data ?? []).map(adapt);
        setDeals(adapted);
        setSource(json.source);
        writeCache(cacheKey, adapted);
      } catch {
        // Silent fail — los componentes se ocultan si deals está vacío.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [fallbackToLowest, limit, cacheKey]);

  const flashDeals = useMemo(() => deals.filter((d) => d.isFlash), [deals]);

  return { deals, flashDeals, loading, source, isEmpty: !loading && deals.length === 0 };
}

function readCache(key: string): Deal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ts: number; data: Deal[] };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return [];
    return parsed.data;
  } catch {
    return [];
  }
}

function writeCache(key: string, data: Deal[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}
