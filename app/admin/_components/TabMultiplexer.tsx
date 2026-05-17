"use client";

/**
 * app/admin/_components/TabMultiplexer.tsx
 *
 * Brandon 2026-05-16 (Fase 4 perf — ADR-113):
 *
 * Wrapper que mantiene en memoria los últimos N tabs visitados del admin.
 * Cuando el usuario cambia de tab:
 *   - El tab actual se OCULTA (display:none + inert) en lugar de unmount
 *   - El tab destino se MUESTRA (si ya estaba en memoria) o se MONTA por
 *     primera vez (si no estaba)
 *
 * Resultado: tab → tab "ya visitado" es INSTANTÁNEO (~16ms = 1 frame) en
 * lugar de los ~300ms del cold mount + first paint.
 *
 * Estrategia para evitar stale props:
 *   - El tab ACTIVO se renderiza con `renderTab(tab)` en cada render →
 *     siempre tiene las props más recientes.
 *   - Los tabs INACTIVOS reusan el snapshot guardado en el cache → mantienen
 *     su estado React (formularios, filtros) entre activaciones.
 *   - Cuando un inactivo vuelve a activo, se "renueva" pasando a usar el
 *     render actual (props frescas) — el estado interno persiste porque
 *     React reconcilia por `key` estable.
 *
 * LRU eviction: máximo MAX_KEEP_ALIVE tabs simultáneos.
 */

import { memo, useEffect, useRef, type ReactNode } from "react";
import type { Tab } from "../_lib/tabs.types";

/** Máximo de tabs mantenidos en memoria simultáneamente. */
const MAX_KEEP_ALIVE = 5;

interface CacheEntry {
  /** Snapshot del árbol del tab cuando fue activo por última vez */
  element: ReactNode;
  /** Timestamp del último activate — para LRU eviction */
  lastUsed: number;
}

export interface TabMultiplexerProps {
  /** Tab activa */
  activeTab: Tab;
  /** Función que produce el árbol React para una tab dada */
  renderTab: (tab: Tab) => ReactNode;
}

function TabMultiplexerInner({ activeTab, renderTab }: TabMultiplexerProps) {
  const cacheRef = useRef<Map<Tab, CacheEntry>>(new Map());

  // 1. Generar el árbol fresco para el tab activo en cada render →
  //    siempre tiene props actuales.
  const activeElement = renderTab(activeTab);

  // 2. Mantener / actualizar el snapshot del activo en el cache para que,
  //    cuando vuelva a ser inactivo, ya tenga su entry.
  const cache = cacheRef.current;
  const now = Date.now();
  cache.set(activeTab, { element: activeElement, lastUsed: now });

  // 3. LRU eviction síncrona (solo si excedemos el cap).
  if (cache.size > MAX_KEEP_ALIVE) {
    const sorted = Array.from(cache.entries())
      .filter(([t]) => t !== activeTab)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const toEvict = sorted.slice(0, cache.size - MAX_KEEP_ALIVE);
    for (const [tabId] of toEvict) {
      cache.delete(tabId);
    }
  }

  // 4. Dispatch evento custom al cambiar tab para módulos que necesiten
  //    refetch al re-activarse (ej. POS con caja abierta).
  useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("admin-tab-activated", { detail: { tab: activeTab } }),
      );
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  const entries = Array.from(cache.entries());

  return (
    <>
      {entries.map(([tabId, entry]) => {
        const isActive = tabId === activeTab;
        return (
          <div
            key={tabId}
            {...(isActive
              ? {}
              : { inert: "" as unknown as boolean, "aria-hidden": "true" })}
            style={isActive ? undefined : { display: "none" }}
          >
            {entry.element}
          </div>
        );
      })}
    </>
  );
}

export const TabMultiplexer = memo(TabMultiplexerInner);
