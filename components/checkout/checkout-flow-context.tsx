"use client";

/**
 * CheckoutFlowProvider — eleva el estado del checkout a un contexto.
 *
 * Paso 1 del refactor "modal → páginas" del checkout de la tienda (Brandon
 * 2026-06-27): `useCheckoutState` (el reducer central de pasos
 * cuenta→datos→pago→confirmar→success) vivía LOCAL al CheckoutModal, así que el
 * estado moría al desmontar. Elevándolo a un provider montado en StoreProviders
 * el estado SOBREVIVE entre navegaciones — base para que, en el Paso 2, las
 * páginas `/t/<slug>/checkout/*` compartan el mismo estado en vez de un modal.
 *
 * Comportamiento idéntico al de hoy: el CheckoutModal sigue siendo el único
 * consumidor y el provider está siempre montado (igual que el modal, que se
 * renderiza siempre y solo se oculta por `isOpen`). Solo cambia DÓNDE vive el
 * `useReducer`, no su ciclo de vida.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useCheckoutState } from "./hooks/useCheckoutState";

type CheckoutFlowValue = ReturnType<typeof useCheckoutState>;

const CheckoutFlowContext = createContext<CheckoutFlowValue | null>(null);

export function CheckoutFlowProvider({ children }: { children: ReactNode }) {
  const value = useCheckoutState();
  return (
    <CheckoutFlowContext.Provider value={value}>
      {children}
    </CheckoutFlowContext.Provider>
  );
}

export function useCheckoutFlow(): CheckoutFlowValue {
  const ctx = useContext(CheckoutFlowContext);
  if (!ctx) {
    throw new Error("useCheckoutFlow debe usarse dentro de <CheckoutFlowProvider>");
  }
  return ctx;
}
