"use client";

/**
 * app/admin/_hooks/useDemoCleanup.ts
 *
 * Hook que maneja el flujo de limpiar datos de demo por módulo.
 * Extraído de app/admin/page.tsx (Paso 4 del refactor — ver
 * docs/refactor-giant-files-plan.md).
 *
 * Estado manejado:
 *  - clearedDemoTabs → Set<Tab> persistido en localStorage["admin_demo_cleared"]
 *  - demoClearing    → Tab | null (la tab que se está limpiando ahora)
 *
 * API expuesta:
 *  - dismissDemoTab(id)  → marca la tab como "no quiero ver más este aviso"
 *  - clearDemoData(id)   → llama al endpoint DELETE de la tab y luego dismiss
 *
 * Recibe `demoModules` como parámetro para no acoplarse a la constante
 * `DEMO_DATA_MODULES` de page.tsx.
 */

import { useCallback, useState } from "react";
import type { Tab } from "../_lib/tabs.types";

export interface DemoModuleMeta {
  label: string;
  api?: string;
}

export type DemoModulesMap = Partial<Record<Tab, DemoModuleMeta>>;

export interface UseDemoCleanupResult {
  clearedDemoTabs: Set<Tab>;
  demoClearing: Tab | null;
  dismissDemoTab: (id: Tab) => void;
  clearDemoData: (id: Tab) => Promise<void>;
}

export function useDemoCleanup(demoModules: DemoModulesMap): UseDemoCleanupResult {
  const [clearedDemoTabs, setClearedDemoTabs] = useState<Set<Tab>>(() => {
    if (typeof window === "undefined") return new Set<Tab>();
    try {
      const s = localStorage.getItem("admin_demo_cleared");
      return s ? new Set<Tab>(JSON.parse(s)) : new Set<Tab>();
    } catch {
      return new Set<Tab>();
    }
  });

  const [demoClearing, setDemoClearing] = useState<Tab | null>(null);

  const dismissDemoTab = useCallback((id: Tab) => {
    setClearedDemoTabs((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem("admin_demo_cleared", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  }, []);

  const clearDemoData = useCallback(
    async (id: Tab) => {
      const meta = demoModules[id];
      if (!meta?.api) {
        dismissDemoTab(id);
        return;
      }
      setDemoClearing(id);
      try {
        const res = await fetch(meta.api, { method: "DELETE" });
        if (res.ok) dismissDemoTab(id);
      } catch {
        // ignorar — el usuario puede reintentar
      }
      setDemoClearing(null);
    },
    [demoModules, dismissDemoTab]
  );

  return { clearedDemoTabs, demoClearing, dismissDemoTab, clearDemoData };
}
