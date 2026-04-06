"use client";

/**
 * app/admin/_hooks/useFavoritesAndRecent.ts
 *
 * Hook que maneja las tabs favoritas y las recientes del admin.
 * Extraído de app/admin/page.tsx (Paso 4 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Estado manejado:
 *  - favoriteTabs   → Set<Tab> persistido en localStorage["admin_fav_tabs"]
 *  - recentTabs     → Tab[] (máximo 5) persistido en localStorage["admin_recent_tabs"]
 *
 * API expuesta:
 *  - toggleFavorite(id) → añade/quita una tab del set de favoritos
 *  - addRecent(id)      → mueve la tab al inicio de recientes (dedup, máx 5)
 *
 * NOTA: navigateTab() en page.tsx debe llamar a addRecent(id) después
 * de actualizar el tab actual y la URL.
 */

import { useCallback, useState } from "react";
import type { Tab } from "../_lib/tabs.types";

export interface UseFavoritesAndRecentResult {
  favoriteTabs: Set<Tab>;
  toggleFavorite: (id: Tab) => void;
  recentTabs: Tab[];
  addRecent: (id: Tab) => void;
}

export function useFavoritesAndRecent(): UseFavoritesAndRecentResult {
  const [favoriteTabs, setFavoriteTabs] = useState<Set<Tab>>(() => {
    if (typeof window === "undefined") return new Set<Tab>();
    try {
      const s = localStorage.getItem("admin_fav_tabs");
      return s ? new Set<Tab>(JSON.parse(s)) : new Set<Tab>();
    } catch {
      return new Set<Tab>();
    }
  });

  const [recentTabs, setRecentTabs] = useState<Tab[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const s = localStorage.getItem("admin_recent_tabs");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = useCallback((id: Tab) => {
    setFavoriteTabs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("admin_fav_tabs", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  const addRecent = useCallback((id: Tab) => {
    setRecentTabs((prev) => {
      const next = [id, ...prev.filter((t) => t !== id)].slice(0, 5);
      try {
        localStorage.setItem("admin_recent_tabs", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { favoriteTabs, toggleFavorite, recentTabs, addRecent };
}
