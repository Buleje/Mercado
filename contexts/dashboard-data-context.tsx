"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { cachedJson, invalidateCachedJson, suscribirSondeo } from "@/lib/client-cache-fetch";

// ── Shared dashboard response type ──────────────────────────────────────────
// Matches the exact shape returned by /api/admin/dashboard
export interface DashboardPayload {
  products: unknown[];
  orders: unknown[];
  sales: unknown[];
  customers: unknown[];
  purchases: unknown[];
  payables: unknown[];
  suppliers: unknown[];
  reviews: unknown[];
  alerts: { lowStock: number; pendingOrders: number; overduePayables: number };
  counts?: {
    products: number; orders: number; sales: number; customers: number;
    purchases: number; payables: number; suppliers: number; reviews: number;
  };
  summary?: { todayRevenue: number; todayTickets: number; days: number };
  dailyRevenue?: { date: string; orders: number; sales: number; total: number; count: number }[];
  pagination?: {
    limit: number;
    hasMore: { orders: boolean; sales: boolean };
    cursor: { orders: number | null; sales: number | null };
  };
}

interface DashboardDataContextValue {
  data: DashboardPayload | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: (silent?: boolean) => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

const REFRESH_INTERVAL = 30_000;
const URL_TABLERO = "/api/admin/dashboard";

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const activeRef = useRef(true);

  const aplicar = useCallback((json: DashboardPayload | null) => {
    if (!activeRef.current) return;
    if (json) {
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } else {
      setError("No se pudo cargar el resumen");
    }
    setLoading(false);
  }, []);

  /** Pide ya, sin lo guardado (botón «Actualizar», tras registrar algo). */
  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      invalidateCachedJson(URL_TABLERO);
      aplicar(await cachedJson<DashboardPayload>(URL_TABLERO, REFRESH_INTERVAL));
    },
    [aplicar],
  );

  // Sondeo compartido (16-10): un timer aunque StrictMode monte dos veces,
  // pausa con la pestaña oculta, y la primera lectura comparte el pedido del
  // asistente de primeros pasos (cachedJson).
  useEffect(() => {
    activeRef.current = true;
    const baja = suscribirSondeo<DashboardPayload>(URL_TABLERO, REFRESH_INTERVAL, aplicar);
    return () => {
      activeRef.current = false;
      baja();
    };
  }, [aplicar]);

  return (
    <DashboardDataContext.Provider value={{ data, loading, error, lastUpdated, refresh }}>
      {children}
    </DashboardDataContext.Provider>
  );
}

/**
 * Hook to consume shared dashboard data.
 * Falls back to independent fetch when used outside provider (backwards-compatible).
 */
export function useDashboardData(): DashboardDataContextValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error("useDashboardData must be used within DashboardDataProvider");
  }
  return ctx;
}
