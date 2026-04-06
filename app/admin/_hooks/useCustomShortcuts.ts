"use client";

/**
 * app/admin/_hooks/useCustomShortcuts.ts
 *
 * Hook que lee los shortcuts personalizados guardados desde SettingsModule
 * en `localStorage["admin_custom_shortcuts"]`. Re-fetcha cuando:
 *  - Otro tab cambia el localStorage (evento "storage")
 *  - El mismo tab dispara el evento custom "admin-shortcuts-changed"
 *
 * Resuelve el icono mirando contra `allTabs` y filtra los huérfanos
 * (shortcuts a tabs que ya no existen).
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import type { Tab } from "../_lib/tabs.types";

export interface CustomShortcutItem {
  id: Tab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface AllTabsItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface SavedShortcut {
  id: string;
  label: string;
  tabId: string;
}

export function useCustomShortcuts(allTabs: readonly AllTabsItem[]): CustomShortcutItem[] {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener("storage", handler);
    // Same-tab notification
    window.addEventListener("admin-shortcuts-changed", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("admin-shortcuts-changed", handler);
    };
  }, []);

  return useMemo<CustomShortcutItem[]>(() => {
    try {
      const saved = localStorage.getItem("admin_custom_shortcuts");
      if (!saved) return [];
      const shortcuts = JSON.parse(saved) as SavedShortcut[];
      return shortcuts
        .filter((s) => allTabs.some((t) => t.id === s.tabId))
        .map((s) => {
          const match = allTabs.find((t) => t.id === s.tabId);
          return match ? { id: s.tabId as Tab, label: s.label, icon: match.icon } : null;
        })
        .filter((s): s is CustomShortcutItem => s !== null);
    } catch {
      return [];
    }
    // version triggera el re-compute, allTabs es estable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, allTabs]);
}
