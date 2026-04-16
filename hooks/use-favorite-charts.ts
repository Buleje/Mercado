"use client";

import { useState, useCallback } from "react";

/**
 * Unified hook for chart favorites across all admin modules.
 * Replaces: useSalesFavCharts, useComprasFavCharts, useCatFavCharts,
 *           useFavCharts (inventario), useFinanzasFavCharts.
 *
 * @param moduleId - Unique key per module (e.g. "compras", "pos-caja")
 */
export function useFavoriteCharts(moduleId: string) {
  const storageKey = `fav-charts-${moduleId}`;

  const [favs, setFavs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      return [];
    }
  });

  const toggle = useCallback(
    (id: string) =>
      setFavs((prev) => {
        const next = prev.includes(id)
          ? prev.filter((f) => f !== id)
          : [...prev, id];
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* SSR or quota */
        }
        return next;
      }),
    [storageKey],
  );

  const isFav = useCallback((id: string) => favs.includes(id), [favs]);

  return { favs, toggle, isFav };
}
