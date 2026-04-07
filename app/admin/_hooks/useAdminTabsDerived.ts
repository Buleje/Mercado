"use client";

/**
 * app/admin/_hooks/useAdminTabsDerived.ts
 *
 * Hook que centraliza los derivados de tabs: allowedTabs, filteredTabs,
 * favoriteTabItems y recentTabItems. Todos memoizados para evitar
 * re-cómputos en cada render.
 *
 * Extraído de app/admin/page.tsx (Sprint A del refactor —
 * ver docs/refactor-giant-files-plan.md).
 */

import { useMemo } from "react";
import { ALL_TABS } from "../_lib/tab-data";
import type { Tab } from "../_lib/tabs.types";
import type { TabCategory } from "../_lib/tab-categories";
import { MODULE_PERMISSIONS } from "@/lib/module-permissions";

type Params = {
  userRole: string;
  savedRolePerms: Record<string, string[]> | null;
  hiddenTabs: Set<Tab>;
  selectedCategory: string | null;
  visibleCategories: TabCategory[];
  sidebarSearch: string;
  favoriteTabs: Set<Tab>;
  recentTabs: Tab[];
  currentTab: Tab;
  fuzzyMatch: (text: string, query: string) => boolean;
};

export function useAdminTabsDerived(params: Params) {
  const {
    userRole,
    savedRolePerms,
    hiddenTabs,
    selectedCategory,
    visibleCategories,
    sidebarSearch,
    favoriteTabs,
    recentTabs,
    currentTab,
    fuzzyMatch,
  } = params;

  const allowedTabs = useMemo((): Tab[] => {
    // DEFAULT_ROLE_TABS: base sin overrides guardados.
    // Los casts a Tab[] son intencionales — MODULE_PERMISSIONS usa ModuleId[]
    // pero en la práctica los ids coinciden con los del tipo Tab.
    const DEFAULT_ROLE_TABS: Record<string, Tab[]> = {
      admin: ALL_TABS.map(t => t.id),
      cajero: MODULE_PERMISSIONS.cajero as unknown as Tab[],
      almacenero: MODULE_PERMISSIONS.almacenero as unknown as Tab[],
    };
    // ROLE_TABS: overrides guardados por Settings sobreescriben defaults,
    // pero admin siempre tiene acceso completo (no puede limitarse).
    const ROLE_TABS: Record<string, Tab[]> = {
      ...DEFAULT_ROLE_TABS,
      ...(savedRolePerms
        ? Object.fromEntries(
            Object.entries(savedRolePerms).map(([role, tabs]) => [role, tabs as Tab[]]),
          )
        : {}),
      // admin siempre ve todo — no puede ser restringido por overrides
      admin: ALL_TABS.map(t => t.id),
    };
    return ROLE_TABS[userRole] ?? ROLE_TABS.admin;
  }, [userRole, savedRolePerms]);

  const filteredTabs = useMemo(() => {
    // Filtra por permisos de rol + tabs ocultos manualmente
    let result = ALL_TABS.filter(
      t => allowedTabs.includes(t.id) && !hiddenTabs.has(t.id),
    );

    // Filtra por categoría seleccionada en el sidebar
    if (selectedCategory) {
      const categoryTabs =
        visibleCategories.find(c => c.id === selectedCategory)?.tabs ?? [];
      result = result.filter(t => categoryTabs.includes(t.id));
    }

    // Fuzzy search en el sidebar
    if (sidebarSearch.trim()) {
      result = result.filter(t => fuzzyMatch(t.label, sidebarSearch.trim()));
    }

    return result;
  }, [allowedTabs, hiddenTabs, selectedCategory, visibleCategories, sidebarSearch, fuzzyMatch]);

  const favoriteTabItems = useMemo(
    () =>
      ALL_TABS.filter(
        t => favoriteTabs.has(t.id) && allowedTabs.includes(t.id),
      ),
    [favoriteTabs, allowedTabs],
  );

  const recentTabItems = useMemo(
    () =>
      recentTabs
        .filter(
          id =>
            id !== currentTab &&
            !favoriteTabs.has(id) &&
            allowedTabs.includes(id),
        )
        .map(id => ALL_TABS.find(t => t.id === id)!)
        .filter(Boolean)
        .slice(0, 5),
    [recentTabs, currentTab, favoriteTabs, allowedTabs],
  );

  return { allowedTabs, filteredTabs, favoriteTabItems, recentTabItems };
}
