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
 * Persistido en localStorage["admin_sidebar_shortcuts"].
 *
 * Requiere recibir `allTabs` (lista canónica de tabs con icono) y
 * `allowedTabs` (filtro por rol) para resolver iconos y filtrar el picker.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useCallback, useMemo, useState } from "react";
import type { ComponentType } from "react";

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

export function useSidebarShortcuts(
  allTabs: readonly AllTabsItem[],
  allowedTabs: readonly string[]
): UseSidebarShortcutsResult {
  const [sidebarShortcuts, setSidebarShortcuts] = useState<ShortcutItem[]>(() => {
    try {
      const saved = localStorage.getItem("admin_sidebar_shortcuts");
      if (saved) {
        const parsed = JSON.parse(saved) as ShortcutItem[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
          const match = allTabs.find((t) => t.id === s.id);
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
