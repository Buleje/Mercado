"use client";

/**
 * app/admin/_hooks/useSidebarShortcuts.ts
 *
 * Hook que maneja los "shortcuts" personalizados del sidebar admin
 * (los iconos rápidos en la barra lateral). El usuario puede:
 *  - Editar el orden con flechas
 *  - Agregar/quitar shortcuts desde un picker
 *  - Resetear a los defaults
 *
 * Persistido en localStorage["admin_sidebar_shortcuts"]. Lo guardado se lee
 * a través de `resolverDestino` (ADR-490): un id viejo sigue siendo un atajo.
 *
 * Requiere recibir `allTabs` (lista canónica de tabs con icono) y
 * `allowedTabs` (filtro por rol) para resolver iconos y filtrar el picker.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useCallback, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { resolverDestino } from "@/lib/admin/destino-tab";

export interface ShortcutItem {
  id: string;
  label: string;
}

export interface ResolvedShortcut extends ShortcutItem {
  icon: ComponentType<{ className?: string }>;
}

export interface AllTabsItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export interface UseSidebarShortcutsResult {
  sidebarShortcuts: ShortcutItem[];
  editingShortcuts: boolean;
  setEditingShortcuts: (v: boolean) => void;
  showAddShortcut: boolean;
  setShowAddShortcut: (v: boolean) => void;
  saveSidebarShortcuts: (next: ShortcutItem[]) => void;
  removeShortcut: (id: string) => void;
  addShortcut: (tabId: string) => void;
  moveShortcut: (idx: number, dir: -1 | 1) => void;
  resolvedShortcuts: ResolvedShortcut[];
  availableForShortcut: AllTabsItem[];
}

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: "asistente-ia", label: "Dashboard" },
  { id: "inventario", label: "Stock" },
  { id: "pedidos", label: "Pedidos" },
  { id: "fiados", label: "Fiados" },
];

/**
 * Los atajos guardados, con los ids de hoy. Un id viejo que es otro nombre del
 * mismo módulo (`kardex` → Inventario) pasa al nombre de hoy y a su rótulo; uno
 * cuya pestaña hoy es una VISTA de otra se conserva tal cual (`navigateTab` lo
 * lleva a la vista exacta); uno que no existe se descarta (antes tampoco se
 * dibujaba: no tenía ícono). Dos que llevan al mismo lugar quedan en uno.
 */
export function atajosVigentes(guardados: readonly unknown[], allTabs: readonly AllTabsItem[]): ShortcutItem[] {
  const vistos = new Set<string>();
  const vigentes: ShortcutItem[] = [];
  for (const guardado of guardados) {
    if (!guardado || typeof guardado !== "object") continue;
    const { id: crudo, label } = guardado as Partial<ShortcutItem>;
    if (typeof crudo !== "string") continue;
    const destino = resolverDestino(crudo);
    if (!destino) continue;
    const id = destino.vista ? crudo : destino.tab;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const rotulo = id === crudo && typeof label === "string" ? label : allTabs.find((t) => t.id === id)?.label;
    vigentes.push({ id, label: rotulo ?? (typeof label === "string" ? label : id) });
  }
  return vigentes;
}

export function useSidebarShortcuts(
  allTabs: readonly AllTabsItem[],
  allowedTabs: readonly string[]
): UseSidebarShortcutsResult {
  const [sidebarShortcuts, setSidebarShortcuts] = useState<ShortcutItem[]>(() => {
    try {
      const saved = localStorage.getItem("admin_sidebar_shortcuts");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        const vigentes = Array.isArray(parsed) ? atajosVigentes(parsed, allTabs) : [];
        if (vigentes.length > 0) return vigentes;
      }
    } catch {
      // localStorage bloqueado — usar defaults
    }
    return DEFAULT_SHORTCUTS;
  });

  const [editingShortcuts, setEditingShortcuts] = useState(false);
  const [showAddShortcut, setShowAddShortcut] = useState(false);

  const saveSidebarShortcuts = useCallback((next: ShortcutItem[]) => {
    setSidebarShortcuts(next);
    try {
      localStorage.setItem("admin_sidebar_shortcuts", JSON.stringify(next));
    } catch {}
  }, []);

  const removeShortcut = useCallback(
    (id: string) => {
      saveSidebarShortcuts(sidebarShortcuts.filter((s) => s.id !== id));
    },
    [sidebarShortcuts, saveSidebarShortcuts]
  );

  const addShortcut = useCallback(
    (tabId: string) => {
      const match = allTabs.find((t) => t.id === tabId);
      if (match && !sidebarShortcuts.some((s) => s.id === tabId)) {
        saveSidebarShortcuts([...sidebarShortcuts, { id: tabId, label: match.label }]);
      }
      setShowAddShortcut(false);
    },
    [sidebarShortcuts, saveSidebarShortcuts, allTabs]
  );

  const moveShortcut = useCallback(
    (idx: number, dir: -1 | 1) => {
      const next = [...sidebarShortcuts];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= next.length) return;
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      saveSidebarShortcuts(next);
    },
    [sidebarShortcuts, saveSidebarShortcuts]
  );

  const resolvedShortcuts = useMemo<ResolvedShortcut[]>(
    () =>
      sidebarShortcuts
        .map((s) => {
          // Un atajo a una pestaña que hoy es vista toma el ícono de su destino.
          const destino = resolverDestino(s.id)?.tab;
          const match = allTabs.find((t) => t.id === s.id) ?? allTabs.find((t) => t.id === destino);
          return match ? { ...s, icon: match.icon } : null;
        })
        .filter((s): s is ResolvedShortcut => s !== null),
    [sidebarShortcuts, allTabs]
  );

  const availableForShortcut = useMemo<AllTabsItem[]>(
    () =>
      allTabs.filter(
        (t) => allowedTabs.includes(t.id) && !sidebarShortcuts.some((s) => s.id === t.id)
      ),
    [allTabs, allowedTabs, sidebarShortcuts]
  );

  return {
    sidebarShortcuts,
    editingShortcuts,
    setEditingShortcuts,
    showAddShortcut,
    setShowAddShortcut,
    saveSidebarShortcuts,
    removeShortcut,
    addShortcut,
    moveShortcut,
    resolvedShortcuts,
    availableForShortcut,
  };
}
