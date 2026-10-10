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
import { normalizarGuardadas } from "@/lib/admin/permiso-vista";
import { ALL_TABS } from "../_lib/tab-data";
import type { Tab } from "../_lib/tabs.types";

/**
 * Un id guardado que dejó de ser pestaña (renombrado o absorbido en las olas del
 * panel unificado) se normaliza AL CARGAR: si sólo se normalizara al dibujar, la
 * estrella y `toggleFavorite` seguirían viendo el id viejo y ese favorito ya no
 * se podría quitar (revisión de la ola 1, 09-10).
 */
const IDS_CONOCIDOS: ReadonlySet<string> = new Set(ALL_TABS.map((t) => t.id));
const leerGuardadas = (clave: string): Tab[] => {
  const s = localStorage.getItem(clave);
  return s ? (normalizarGuardadas(JSON.parse(s) as string[], IDS_CONOCIDOS) as Tab[]) : [];
};

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
      return new Set<Tab>(leerGuardadas("admin_fav_tabs"));
    } catch {
      return new Set<Tab>();
    }
  });

  const [recentTabs, setRecentTabs] = useState<Tab[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return leerGuardadas("admin_recent_tabs");
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
