"use client";

import { useEffect } from "react";

/**
 * Hook que prefetcha en background las APIs admin más usadas y las cachea
 * en localStorage. Se monta una sola vez al entrar al admin (en /admin/page.tsx)
 * para que cualquier sub-tab que el usuario abra después tenga sus datos
 * disponibles instantáneo.
 *
 * Cada API tiene su propio TTL acorde a la frecuencia de cambio:
 * - products/suppliers: 5–30 min (cambian poco)
 * - sales/customers: 60s (frescos pero no urgentes)
 * - dashboard/stats: 30s
 *
 * Solo prefetcha si el cache está vacío o stale. No bloquea el render.
 */

interface CacheConfig {
  url: string;
  storageKey: string;
  ttlMs: number;
  parser?: (json: unknown) => unknown;
  // Para entradas anidadas en {data, ts}
}

const PREFETCH_TARGETS: CacheConfig[] = [
  {
    url: "/api/products",
    storageKey: "poc-products-cache",
    ttlMs: 5 * 60 * 1000,
    parser: (json: unknown) => {
      const j = json as { products?: unknown[] } | unknown[];
      const raw = Array.isArray(j) ? j : (j as { products?: unknown[] }).products ?? [];
      return raw.filter((p: unknown) => (p as { active?: boolean }).active !== false);
    },
  },
  {
    url: "/api/suppliers",
    storageKey: "poc-suppliers-cache",
    ttlMs: 30 * 60 * 1000,
    parser: (json: unknown) => {
      const j = json as { suppliers?: unknown[] } | unknown[];
      return Array.isArray(j) ? j : (j as { suppliers?: unknown[] }).suppliers ?? [];
    },
  },
  {
    url: "/api/customers",
    storageKey: "admin-customers-cache",
    ttlMs: 5 * 60 * 1000,
    parser: (json: unknown) => {
      const j = json as { customers?: unknown[] } | unknown[];
      return Array.isArray(j) ? j : (j as { customers?: unknown[] }).customers ?? [];
    },
  },
  {
    url: "/api/sales?limit=200",
    storageKey: "admin-sales-cache",
    ttlMs: 60 * 1000,
    parser: (json: unknown) => (Array.isArray(json) ? json : []),
  },
  {
    url: "/api/admin/dashboard",
    storageKey: "admin-dashboard-cache",
    ttlMs: 60 * 1000,
  },
  {
    url: "/api/goals",
    storageKey: "admin-goals-cache",
    ttlMs: 60 * 1000,
    parser: (json: unknown) => (Array.isArray(json) ? json : []),
  },
];

function isCacheFresh(storageKey: string, ttlMs: number): boolean {
  try {
    const cached = localStorage.getItem(storageKey);
    if (!cached) return false;
    const { ts } = JSON.parse(cached) as { ts?: number };
    return typeof ts === "number" && Date.now() - ts < ttlMs;
  } catch {
    return false;
  }
}

async function prefetchOne(config: CacheConfig): Promise<void> {
  if (isCacheFresh(config.storageKey, config.ttlMs)) return;
  try {
    const res = await fetch(config.url, { credentials: "include", cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    const data = config.parser ? config.parser(json) : json;
    try {
      localStorage.setItem(config.storageKey, JSON.stringify({ data, ts: Date.now() }));
    } catch {
      /* quota exceeded — siguente intento */
    }
  } catch (err) {
    console.warn(`[admin-prefetch] ${config.url} failed`, err instanceof Error ? err.message : String(err));
  }
}

export function useAdminPrefetch() {
  useEffect(() => {
    // Espera a que el render principal termine antes de pre-fetchear,
    // así no compite por CPU con la primera pintura.
    const timer = setTimeout(() => {
      void Promise.allSettled(PREFETCH_TARGETS.map(prefetchOne));
    }, 800);
    return () => clearTimeout(timer);
  }, []);
}
