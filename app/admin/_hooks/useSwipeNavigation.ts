"use client";

/**
 * app/admin/_hooks/useSwipeNavigation.ts
 *
 * Hook que devuelve los swipe handlers para navegar entre tabs en mobile:
 *  - Swipe left  → tab siguiente (en orden de TAB_CATEGORIES.flatMap)
 *  - Swipe right → tab anterior
 *
 * Wrappea `useSwipe` con la lógica de navegación lineal por todas las tabs
 * de todas las categorías en orden de declaración.
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useCallback } from "react";
import { useSwipe } from "@/hooks/use-swipe";
import type { Tab } from "../_lib/tabs.types";

interface TabCategoryLike {
  tabs: readonly Tab[];
}

export function useSwipeNavigation(
  currentTab: Tab,
  navigateTab: (id: Tab) => void,
  categories: readonly TabCategoryLike[]
): ReturnType<typeof useSwipe> {
  const onSwipeLeft = useCallback(() => {
    const allIds = categories.flatMap((c) => c.tabs);
    const idx = allIds.indexOf(currentTab);
    if (idx >= 0 && idx < allIds.length - 1) navigateTab(allIds[idx + 1]);
  }, [currentTab, navigateTab, categories]);

  const onSwipeRight = useCallback(() => {
    const allIds = categories.flatMap((c) => c.tabs);
    const idx = allIds.indexOf(currentTab);
    if (idx > 0) navigateTab(allIds[idx - 1]);
  }, [currentTab, navigateTab, categories]);

  return useSwipe(onSwipeLeft, onSwipeRight);
}
