"use client";

/**
 * useAdminTemplateOverlay — overlay reactivo de la plantilla del superadmin.
 *
 * Lee `lib/admin-template.ts` y expone helpers para resolver, en cada render
 * del panel admin:
 *   - `resolveLabel(tabId)`     → label custom si la plantilla lo sobreescribe.
 *   - `isHiddenByTemplate(tabId)` → true si el superadmin marcó el módulo como
 *                                    no visible por default (puede mostrarlo
 *                                    el dueño manualmente desde el sidebar).
 *   - `getRequiredPlan(tabId)`   → plan mínimo (free/pro/enterprise) según la
 *                                   plantilla (override sobre el catálogo).
 *
 * Reactividad: se suscribe al evento `buleje:admin-template-changed`. Cuando
 * el superadmin actualiza la plantilla, los componentes que usan este hook
 * re-renderan automáticamente — sin recargar la página.
 *
 * Storage: localStorage (cliente). Próxima fase: API + tabla AdminTemplate.
 */

import { useCallback, useEffect, useState } from "react";
import { SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import {
  type AdminPlan,
  type AdminTemplate,
  ADMIN_MODULE_CATALOG,
  onAdminTemplateChange,
  readAdminTemplate,
  fetchAdminTemplate,
} from "@/lib/admin-template";

export interface AdminTemplateOverlay {
  template: AdminTemplate;
  /** Label efectivo del tab (override del superadmin sobre el default de ALL_TABS). */
  resolveLabel: (tabId: string, fallback: string) => string;
  /** true si el superadmin oculta el módulo por default. */
  isHiddenByTemplate: (tabId: string) => boolean;
  /** Plan mínimo requerido para el módulo (free/pro/enterprise). */
  getRequiredPlan: (tabId: string) => AdminPlan;
}

export function useAdminTemplateOverlay(): AdminTemplateOverlay {
  const [template, setTemplate] = useState<AdminTemplate>(() => readAdminTemplate());

  // Primer paint: leemos del cache (localStorage) para evitar flash. En
  // paralelo pedimos la versión real al servidor; si difiere, re-renderea.
  // De ahí en adelante, los CustomEvents y el storage event mantienen
  // sincronizado el overlay con cualquier guardado del superadmin.
  useEffect(() => {
    let alive = true;
    fetchAdminTemplate().then((remote) => {
      if (alive) setTemplate(remote);
    });
    const unsubscribe = onAdminTemplateChange((next) => setTemplate(next));
    const onStorage = (e: StorageEvent) => {
      if (e.key === "buleje-admin-template") setTemplate(readAdminTemplate());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolveLabel = useCallback(
    (tabId: string, fallback: string): string => {
      const ov = template.overrides[tabId];
      return ov?.label?.trim() || fallback;
    },
    [template],
  );

  const isHiddenByTemplate = useCallback(
    (tabId: string): boolean => {
      // Módulos de ESPECIALIZACIÓN (cacao, forestal…) se gobiernan por su
      // feature flag por-tenant (ADR-124), NO por la plantilla genérica: el
      // superadmin los habilita por negocio y deben aparecer aunque la
      // plantilla los tenga en visible:false (bug 2026-07-14: spec ON pero
      // el sidebar no mostraba el enlace). Mismo criterio con el que ya
      // bypasean el plan tier y el filtro vertical.
      if (SPEC_GATED_MODULE_IDS.has(tabId)) return false;
      const entry = ADMIN_MODULE_CATALOG.find((m) => m.id === tabId);
      // Tabs que NO están en el catálogo nunca quedan ocultos por la plantilla.
      if (!entry) return false;
      const ov = template.overrides[tabId];
      const visible = ov?.visible ?? entry.defaultVisible;
      return !visible;
    },
    [template],
  );

  const getRequiredPlan = useCallback(
    (tabId: string): AdminPlan => {
      const entry = ADMIN_MODULE_CATALOG.find((m) => m.id === tabId);
      if (!entry) return "basico";
      const ov = template.overrides[tabId];
      return ov?.plan ?? entry.defaultPlan;
    },
    [template],
  );

  return { template, resolveLabel, isHiddenByTemplate, getRequiredPlan };
}
