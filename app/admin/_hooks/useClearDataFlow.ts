"use client";

/**
 * app/admin/_hooks/useClearDataFlow.ts
 *
 * Hook que maneja el estado del wizard de "limpiar datos del tenant" en
 * 3 pasos. Es el flujo crítico que borra productos, ventas, clientes, etc.
 * para empezar de cero (típicamente después de la demo).
 *
 * Estado:
 *  - showClearConfirm   → modal visible/oculto
 *  - clearConfirmStep   → paso actual del wizard (1, 2, 3)
 *  - clearConfirmText   → texto que el usuario debe escribir para confirmar
 *  - clearingData       → flag de "ejecutando borrado, no cerrar"
 *  - clearCategories    → categorías de datos seleccionadas para borrar
 *
 * Extraído de app/admin/page.tsx (Paso 4 del refactor).
 */

import { useState } from "react";

const DEFAULT_CATEGORIES: ReadonlyArray<string> = [
  "products",
  "customers",
  "orders",
  "sales",
  "suppliers",
  "promotions",
  "cash",
  "reviews",
  "expenses",
  "returns",
  "activity",
  "cms",
  "notifications",
];

export interface UseClearDataFlowResult {
  showClearConfirm: boolean;
  setShowClearConfirm: (v: boolean) => void;
  clearConfirmStep: 1 | 2 | 3;
  setClearConfirmStep: (s: 1 | 2 | 3) => void;
  clearConfirmText: string;
  setClearConfirmText: (s: string) => void;
  clearingData: boolean;
  setClearingData: (v: boolean) => void;
  clearCategories: Set<string>;
  setClearCategories: (s: Set<string>) => void;
}

export function useClearDataFlow(): UseClearDataFlowResult {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmStep, setClearConfirmStep] = useState<1 | 2 | 3>(1);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearingData, setClearingData] = useState(false);
  const [clearCategories, setClearCategories] = useState<Set<string>>(
    () => new Set(DEFAULT_CATEGORIES)
  );

  return {
    showClearConfirm,
    setShowClearConfirm,
    clearConfirmStep,
    setClearConfirmStep,
    clearConfirmText,
    setClearConfirmText,
    clearingData,
    setClearingData,
    clearCategories,
    setClearCategories,
  };
}
