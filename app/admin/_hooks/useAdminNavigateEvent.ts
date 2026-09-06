"use client";

/**
 * app/admin/_hooks/useAdminNavigateEvent.ts
 *
 * El único oído del evento global `admin:navigate`, con el que cualquier widget
 * pide abrir un módulo: el hub de notificaciones, la paleta de comandos (⌘K),
 * el dashboard de cobranzas, el Libro de Títulos Habilitantes y el chat del
 * asistente.
 *
 * ── Por qué acepta tres nombres para lo mismo (2026-08-12) ───────────────────
 * El listener leía SOLO `{ moduleId, tabId }` y exigía `moduleId`. Tres
 * emisores mandaban `{ tab }` —la paleta de comandos para "ir a productos" y
 * "ir a clientes", y `PorCobrarDashboard`— así que esas navegaciones no hacían
 * NADA: el evento salía, nadie lo entendía y no había error en ningún lado.
 * En vez de corregir los emisores uno por uno (y que el próximo vuelva a
 * elegir mal), el listener acepta las tres claves.
 *
 * También pasa `vista` y `sub`: `navigateTab` ya sabía abrir una sub-vista, y
 * sin esto un widget sólo podía dejarte en la puerta del módulo.
 */

import { useEffect } from "react";
import type { Tab } from "../_lib/tabs.types";

interface AdminNavigateDetail {
  /** Las tres formas históricas de decir "este módulo". */
  moduleId?: Tab;
  tabId?: Tab;
  tab?: Tab;
  /** Sub-vista del módulo (`?vista=`). */
  vista?: string;
  /** Tercer nivel, para módulos anidados (`?sub=`). */
  sub?: string;
}

export function useAdminNavigateEvent(
  navigateTab: (id: Tab, vista?: string, sub?: string) => void,
): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const { moduleId, tabId, tab, vista, sub } = ((e as CustomEvent).detail ||
        {}) as AdminNavigateDetail;
      const destino = tabId || tab || moduleId;
      if (destino) navigateTab(destino, vista, sub);
    };
    window.addEventListener("admin:navigate", handler);
    return () => window.removeEventListener("admin:navigate", handler);
  }, [navigateTab]);
}
