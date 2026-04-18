"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

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

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const activeRef = useRef(true);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      if (activeRef.current) {
        setData(json);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (activeRef.current) {
        setError(err instanceof Error ? err.message : "Error al cargar");
      }
    } finally {
      if (activeRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(true), REFRESH_INTERVAL);
    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

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
