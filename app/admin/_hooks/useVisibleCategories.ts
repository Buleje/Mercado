"use client";

/**
 * app/admin/_hooks/useVisibleCategories.ts
 *
 * Ordena `TAB_CATEGORIES` según la preferencia guardada del usuario
 * (`categoryOrder`) y agrega al final cualquier categoría nueva que no
 * esté todavía en el orden persistido.
 *
 * Extraído de app/admin/page.tsx en el Sprint A final del refactor.
 */

import { useMemo } from "react";
import { TAB_CATEGORIES, type TabCategory } from "../_lib/tab-categories";

export function useVisibleCategories(categoryOrder: string[]): TabCategory[] {
  return useMemo(() => {
    if (categoryOrder.length === 0) return TAB_CATEGORIES;
    const ordered: TabCategory[] = [];
    for (const id of categoryOrder) {
      const cat = TAB_CATEGORIES.find((c) => c.id === id);
      if (cat) ordered.push(cat);
    }
    for (const cat of TAB_CATEGORIES) {
      if (!categoryOrder.includes(cat.id)) ordered.push(cat);
    }
    return ordered;
  }, [categoryOrder]);
}
