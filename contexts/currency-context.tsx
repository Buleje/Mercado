"use client";

/**
 * currency-context.tsx — Context global de moneda (PEN/USD).
 *
 * Demo: conversion con rate hardcoded (1 USD = 3.75 PEN).
 * NO usa rates en vivo — solo demo UI. Backend sigue calculando en PEN.
 *
 * Persistencia: localStorage key `buleje-currency`.
 * Default: PEN.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type Currency = "PEN" | "USD";

const STORAGE_KEY = "buleje-currency";
const USD_PER_PEN = 1 / 3.75; // 1 PEN = 0.2667 USD (rate demo)

interface CurrencyCtx {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /**
   * Formatea un monto en PEN al locale activo.
   * Si currency === "USD", convierte a USD con rate demo.
   * Backend siempre guarda PEN — esto es solo UI.
   */
  format: (amountPen: number) => string;
  /** Símbolo de moneda: "S/" o "$" */
  symbol: string;
  /** Rate demo: cuántos USD por 1 PEN */
  rateUsdPerPen: number;
}

const CurrencyContext = createContext<CurrencyCtx | null>(null);

function readStoredCurrency(): Currency {
  if (typeof window === "undefined") return "PEN";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "PEN" || raw === "USD") return raw;
  } catch {
    /* ignore */
  }
  return "PEN";
}

function formatPen(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatUsd(amountUsd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amountUsd);
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("PEN");

  useEffect(() => {
    setCurrencyState(readStoredCurrency());
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try {
      window.localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* ignore */
    }
  }, []);

  const format = useCallback(
    (amountPen: number) => {
      if (currency === "USD") {
        return formatUsd(amountPen * USD_PER_PEN);
      }
      return formatPen(amountPen);
    },
    [currency],
  );

  const symbol = currency === "USD" ? "$" : "S/";

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        format,
        symbol,
        rateUsdPerPen: USD_PER_PEN,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Fallback SSR-safe
    return {
      currency: "PEN" as Currency,
      setCurrency: () => {},
      format: formatPen,
      symbol: "S/",
      rateUsdPerPen: USD_PER_PEN,
    };
  }
  return ctx;
}
