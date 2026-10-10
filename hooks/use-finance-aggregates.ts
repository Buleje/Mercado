"use client";

import { useState, useEffect, useCallback } from "react";
import { cachedJson, invalidateCachedJson } from "@/lib/client-cache-fetch";
import type { FinanceKpis } from "@/lib/finance/finance-kpis";

/**
 * useFinanceAggregates — consumo TRANSVERSAL de la fuente única de KPIs
 * financieros (consolidación fase 2, auditoría 2026-06-15).
 *
 * En vez de que cada tab re-fetchee /api/sales, /api/payables, etc. y re-agregue
 * con su propia fórmula, todos llaman este hook → un solo request por período
 * (deduplicado y cacheado por `cachedJson`). Reemplaza ~48 re-fetchers crudos.
 */

export interface FinanceAggregatesPeriod {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface UseFinanceAggregatesResult {
  kpis: FinanceKpis | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Construye el período {from,to} de un mes (year, month 0-11). */
export function monthPeriod(year: number, month0: number): FinanceAggregatesPeriod {
  const mm = String(month0 + 1).padStart(2, "0");
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export function useFinanceAggregates(period?: FinanceAggregatesPeriod): UseFinanceAggregatesResult {
  const [kpis, setKpis] = useState<FinanceKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const url = period
    ? `/api/admin/finance-aggregates?from=${period.from}&to=${period.to}`
    : "/api/admin/finance-aggregates";

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      if (force) invalidateCachedJson(url);
      try {
        const data = await cachedJson<{ period: FinanceAggregatesPeriod } & FinanceKpis>(url, 60_000);
        if (data) {
          const { period: _period, ...rest } = data;
          setKpis(rest);
        } else {
          setError("No se pudieron cargar los KPIs financieros");
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [url],
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { kpis, loading, error, refresh };
}
