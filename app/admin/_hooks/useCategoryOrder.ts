"use client";

/**
 * app/admin/_hooks/useCategoryOrder.ts
 *
 * Hook que maneja el orden personalizado de categorías del sidebar.
 * Persistido en localStorage["admin_category_order"] (`lib/admin/orden-manual-barra.ts`,
 * que también lee la llave vieja del lápiz de la barra). Se entera de los
 * cambios hechos desde otro lugar (el lápiz, «Volver al orden de fábrica»).
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useCallback, useEffect, useState } from "react";
import { guardarOrdenManual, leerOrdenManual, oirOrdenManual } from "@/lib/admin/orden-manual-barra";

export interface UseCategoryOrderResult {
  categoryOrder: string[];
  /** `[]` = volver al orden de fábrica. */
  saveCategoryOrder: (order: string[]) => void;
}

export function useCategoryOrder(): UseCategoryOrderResult {
  const [categoryOrder, setCategoryOrder] = useState<string[]>(leerOrdenManual);

  useEffect(() => oirOrdenManual(() => setCategoryOrder(leerOrdenManual())), []);

  const saveCategoryOrder = useCallback((order: string[]) => {
    setCategoryOrder(order);
    guardarOrdenManual(order);
  }, []);

  return { categoryOrder, saveCategoryOrder };
}
