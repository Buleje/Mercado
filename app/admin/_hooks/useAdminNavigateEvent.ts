"use client";

/**
 * app/admin/_hooks/useAdminNavigateEvent.ts
 *
 * Hook que escucha el evento global "admin:navigate" emitido por widgets
 * del notification hub y otros componentes externos al sidebar. El payload
 * lleva `{ moduleId, tabId }` — si viene `tabId` se usa, si no se usa
 * `moduleId` como fallback.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useEffect } from "react";
import type { Tab } from "../_lib/tabs.types";

interface AdminNavigateDetail {
  moduleId?: Tab;
  tabId?: Tab;
}

export function useAdminNavigateEvent(navigateTab: (id: Tab) => void): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const { moduleId, tabId } = ((e as CustomEvent).detail || {}) as AdminNavigateDetail;
      if (moduleId) navigateTab(tabId || moduleId);
    };
    window.addEventListener("admin:navigate", handler);
    return () => window.removeEventListener("admin:navigate", handler);
  }, [navigateTab]);
}
