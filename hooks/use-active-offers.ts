"use client";

/**
 * use-active-offers — Brandon 2026-05-18 v3.
 *
 * Centraliza la lógica "¿hay al menos 1 oferta activa en el marketplace?"
 * para gatear visibilidad del link "Ofertas" en navegaciones + sección
 * promo cards en /tiendas. Si no hay ofertas registradas, ni la sección ni
 * el enlace de nav aparecen — evita prometer descuentos inexistentes.
 *
 * Fuente: `/api/marketplace/stores` (cacheado server-side 60s vía getOrSet)
 * Una store tiene `activePromos: number` ya enriquecido desde el backend.
 *
 * Estados:
 *   - `null`  → cargando (no mostrar oferta aún para evitar parpadeo).
 *   - `true`  → hay al menos 1 store con activePromos > 0.
 *   - `false` → ninguna oferta activa.
 */

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 min — alineado al cache server

export function useHasActiveOffers(): boolean | null {
  const [hasOffers, setHasOffers] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = () => {
      // Brandon 2026-05-30 (audit #2 dedup): vía cachedJson — coalesce de
      // requests en vuelo + cache 60s. Este hook lo usan varios componentes a
      // la vez (navbar gate "Ofertas" + sección promo /tiendas) y cada uno
      // hacía su propio fetch de stores?limit=100 (la duplicación ×N del audit).
      cachedJson<{ data?: Array<{ activePromos?: number }> }>(
        "/api/marketplace/stores?limit=100",
        60_000,
      )
        .then((data) => {
          if (cancelled || !data) return;
          const stores = data.data ?? [];
          const has = stores.some((s) => (s.activePromos ?? 0) > 0);
          setHasOffers(has);
        })
        .catch(() => {
          if (!cancelled) setHasOffers(false);
        });
    };

    fetchOnce();
    const id = setInterval(fetchOnce, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return hasOffers;
}
