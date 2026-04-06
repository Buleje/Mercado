"use client";

/**
 * app/admin/_hooks/useHiddenTabs.ts
 *
 * Hook que maneja el set de tabs ocultas por el usuario en el sidebar.
 * Persistido en localStorage["admin_hidden_tabs"].
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useCallback, useState } from "react";
import type { Tab } from "../_lib/tabs.types";

export interface UseHiddenTabsResult {
  hiddenTabs: Set<Tab>;
  toggleHideTab: (id: Tab) => void;
  clearAllHiddenTabs: () => void;
}

export function useHiddenTabs(): UseHiddenTabsResult {
  const [hiddenTabs, setHiddenTabs] = useState<Set<Tab>>(() => {
    if (typeof window === "undefined") return new Set<Tab>();
    try {
      const s = localStorage.getItem("admin_hidden_tabs");
      return s ? new Set<Tab>(JSON.parse(s)) : new Set<Tab>();
    } catch {
      return new Set<Tab>();
    }
  });

  const toggleHideTab = useCallback((id: Tab) => {
    setHiddenTabs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("admin_hidden_tabs", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, []);

  const clearAllHiddenTabs = useCallback(() => {
    setHiddenTabs(new Set());
    try {
      localStorage.removeItem("admin_hidden_tabs");
    } catch {}
  }, []);

  return { hiddenTabs, toggleHideTab, clearAllHiddenTabs };
}
