"use client";

/**
 * app/admin/_hooks/useCategoryOrder.ts
 *
 * Hook que maneja el orden personalizado de categorías del sidebar.
 * Persistido en localStorage["admin_category_order"].
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useCallback, useState } from "react";

export interface UseCategoryOrderResult {
  categoryOrder: string[];
  saveCategoryOrder: (order: string[]) => void;
}

export function useCategoryOrder(): UseCategoryOrderResult {
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const s = localStorage.getItem("admin_category_order");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });

  const saveCategoryOrder = useCallback((order: string[]) => {
    setCategoryOrder(order);
    try {
      localStorage.setItem("admin_category_order", JSON.stringify(order));
    } catch {}
  }, []);

  return { categoryOrder, saveCategoryOrder };
}
