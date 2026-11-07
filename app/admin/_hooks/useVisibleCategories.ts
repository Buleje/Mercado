"use client";

/**
 * app/admin/_hooks/useVisibleCategories.ts
 *
 * El orden de las categorías de la barra (`lib/admin/orden-barra.ts`): el que
 * la persona fijó a mano (`categoryOrder`) manda; si no hay, el de fábrica con
 * el bloque del rubro arriba; dentro del rubro, por uso del negocio. Las
 * categorías nuevas que no estaban en el orden guardado van al final.
 *
 * Extraído de app/admin/page.tsx en el Sprint A final del refactor.
 */

import { useMemo } from "react";
import { TAB_CATEGORIES, type TabCategory } from "../_lib/tab-categories";
import { ordenarBarra } from "@/lib/admin/orden-barra";
import type { OrdenAutomatico } from "./useOrdenAutomatico";

const SIN_AUTOMATICO: OrdenAutomatico = { rubros: [], uso: {} };

export function useVisibleCategories(
  categoryOrder: string[],
  automatico: OrdenAutomatico = SIN_AUTOMATICO,
): TabCategory[] {
  const { rubros, uso } = automatico;
  return useMemo(
    () => ordenarBarra(TAB_CATEGORIES, { ordenManual: categoryOrder, rubros, uso }),
    [categoryOrder, rubros, uso],
  );
}
