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
 *  4. Default `"vendor-dashboard"`
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

import { useCallback, useEffect, useState } from "react";
import { TAB_MIGRATION } from "../_lib/tab-migration";
import { VALID_TABS, type Tab } from "../_lib/tabs.types";
import { useTabFrequency } from "./useTabFrequency";

export interface UseAdminTabsResult {
  tab: Tab;
  setTab: (id: Tab) => void;
  /** `vista` = sub-vista dentro del módulo destino (la usa el buscador). */
  navigateTab: (id: Tab, vista?: string) => void;
  topTabs: (n: number) => string[];
}

/**
 * El tab que dicta la URL (query o hash), o `null` si la URL no dice nada.
 *
 * Vive aparte de `resolveInitialTab` porque el historial NO puede caer a
 * localStorage: al volver atrás a Inicio (URL sin `?tab=`), el "último tab
 * guardado" es justamente el módulo que se está dejando, y el atrás no hacía
 * nada visible.
 */
function tabDesdeUrl(): Tab | null {
  if (typeof window === "undefined") return null;

  // 1. Query param ?tab=...
  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (urlTab) {
    const migrated = TAB_MIGRATION[urlTab];
    if (migrated) return migrated;
    if (VALID_TABS.includes(urlTab as Tab)) return urlTab as Tab;
    // Un ?tab explícito que no existe va a Inicio, NO al último tab guardado:
    // caer en localStorage abría "cualquier cosa" según la sesión anterior, y
    // el mismo link llevaba a cada persona a un lugar distinto.
    return "vendor-dashboard";
  }

  // 2. Hash #...
  const hash = window.location.hash.slice(1);
  if (hash) {
    const migrated = TAB_MIGRATION[hash];
    if (migrated) return migrated;
    if (VALID_TABS.includes(hash as Tab)) return hash as Tab;
    return "vendor-dashboard";
  }

  return null;
}

function resolveInitialTab(): Tab {
  if (typeof window === "undefined") return "vendor-dashboard";

  const deLaUrl = tabDesdeUrl();
  if (deLaUrl) return deLaUrl;

  // 3. localStorage — "retomar último tab". Brandon 2026-05-28: SOLO en
  // desktop. En mobile, abrir `/admin` directo (sin ?tab ni #hash) debe llevar
  // SIEMPRE a Inicio (vendor-dashboard) — el dueño quiere ver caja/pedidos/
  // alertas primero, no el último módulo donde quedó (ej. Chat IA). Los deep
  // links (?tab=) y el hash siguen respetándose arriba.
  const isMobile = window.innerWidth < 768;
  if (!isMobile) {
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
  }

  return "vendor-dashboard";
}

export function useAdminTabs(addRecent: (id: Tab) => void): UseAdminTabsResult {
  const [tab, setTab] = useState<Tab>(resolveInitialTab);
  const { trackTab, getTopTabs } = useTabFrequency();

  const navigateTab = useCallback(
    (id: Tab, vista?: string) => {
      setTab(id);
      try {
        localStorage.setItem("admin_active_tab", id);
      } catch {
        // localStorage no disponible — ignorar
      }
      // Persiste en URL hash + search param para deep-linking y reload.
      try {
        const url = new URL(window.location.href);
        const tabActual = url.searchParams.get("tab");
        url.searchParams.set("tab", id);
        // La sub-vista pertenece al módulo que se está dejando: si viaja, el
        // módulo nuevo recibe un `?vista=` que no es suyo (ver useVistaModulo).
        // Salvo que el destino traiga la suya —el buscador manda a una vista
        // concreta— en cuyo caso esa gana.
        if (vista) url.searchParams.set("vista", vista);
        else if (tabActual !== id) url.searchParams.delete("vista");
        url.hash = id;
        /**
         * `pushState` y no `replaceState`: con replace, saltar de módulo NUNCA
         * dejaba entrada en el historial, así que el botón «atrás» del
         * navegador (y el gesto del trackpad, y Alt+←) se saltaba el panel
         * entero y salía al sitio anterior. En un panel de 133 módulos, volver
         * a donde estabas es de las cosas que más se hacen.
         *
         * Si es el MISMO tab se reemplaza: hacer click en el módulo en el que
         * ya estás no debe llenar el historial de entradas iguales.
         */
        if (tabActual === id) {
          window.history.replaceState(null, "", url.toString());
        } else {
          window.history.pushState(null, "", url.toString());
        }
      } catch {
        // window.history no disponible — ignorar
      }
      addRecent(id);
      trackTab(id);
    },
    [addRecent, trackTab],
  );

  /**
   * Atrás/adelante del navegador → sincronizar el tab con la URL.
   *
   * Sin esto, `pushState` sería peor que el estado anterior: la URL cambiaría
   * al ir atrás pero la pantalla seguiría mostrando el módulo viejo. `popstate`
   * sólo dispara en navegaciones del historial, no en las nuestras.
   *
   * Resuelve SÓLO desde la URL, nunca desde localStorage: `admin_active_tab`
   * guarda el último módulo visitado, así que volver a una entrada sin `?tab=`
   * (Inicio) reabría justo el módulo del que venías. El historial manda.
   */
  useEffect(() => {
    const onPop = () => setTab(tabDesdeUrl() ?? "vendor-dashboard");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return { tab, setTab, navigateTab, topTabs: getTopTabs };
}
