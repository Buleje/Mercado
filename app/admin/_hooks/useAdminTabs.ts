"use client";

/**
 * app/admin/_hooks/useAdminTabs.ts
 *
 * Hook que centraliza el estado de la tab activa del panel admin.
 * Extraído de app/admin/page.tsx (Paso 4 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Estado y lógica:
 *  - `tab`            → tab activa (tipo `Tab`)
 *  - `setTab`         → setter directo (uso interno o de tests)
 *  - `navigateTab`    → setter "público": actualiza URL (?tab=&hash) +
 *                       persiste en localStorage + registra en `addRecent`
 *
 * Inicialización (en orden de prioridad):
 *  1. Query string `?tab=...`
 *  2. Hash `#...`
 *  3. localStorage `admin_active_tab`
 *  4. Default `"asistente-ia"`
 *
 * En todos los casos pasa por `TAB_MIGRATION` (legacy → nuevo id) y por
 * `VALID_TABS` (whitelist de tabs visibles desde sidebar).
 *
 * Uso:
 * ```tsx
 * const { addRecent } = useFavoritesAndRecent();
 * const { tab, setTab, navigateTab } = useAdminTabs(addRecent);
 * ```
 */

import { useCallback, useState } from "react";
import { TAB_MIGRATION } from "../_lib/tab-migration";
import { VALID_TABS, type Tab } from "../_lib/tabs.types";

export interface UseAdminTabsResult {
  tab: Tab;
  setTab: (id: Tab) => void;
  navigateTab: (id: Tab) => void;
}

function resolveInitialTab(): Tab {
  if (typeof window === "undefined") return "asistente-ia";

  // 1. Query param ?tab=...
  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (urlTab) {
    const migrated = TAB_MIGRATION[urlTab];
    if (migrated) return migrated;
    if (VALID_TABS.includes(urlTab as Tab)) return urlTab as Tab;
  }

  // 2. Hash #...
  const hash = window.location.hash.slice(1);
  if (hash) {
    const migrated = TAB_MIGRATION[hash];
    if (migrated) return migrated;
    if (VALID_TABS.includes(hash as Tab)) return hash as Tab;
  }

  // 3. localStorage
  try {
    const saved = localStorage.getItem("admin_active_tab");
    if (saved) {
      const migrated = TAB_MIGRATION[saved];
      if (migrated) return migrated;
      if (VALID_TABS.includes(saved as Tab)) return saved as Tab;
    }
  } catch {
    // localStorage no disponible (modo privado, SSR, etc.)
  }

  return "asistente-ia";
}

export function useAdminTabs(addRecent: (id: Tab) => void): UseAdminTabsResult {
  const [tab, setTab] = useState<Tab>(resolveInitialTab);

  const navigateTab = useCallback(
    (id: Tab) => {
      setTab(id);
      try {
        localStorage.setItem("admin_active_tab", id);
      } catch {
        // localStorage no disponible — ignorar
      }
      // Persiste en URL hash + search param para deep-linking y reload
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("tab", id);
        url.hash = id;
        window.history.replaceState(null, "", url.toString());
      } catch {
        // window.history no disponible — ignorar
      }
      addRecent(id);
    },
    [addRecent],
  );

  return { tab, setTab, navigateTab };
}
