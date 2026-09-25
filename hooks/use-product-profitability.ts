"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductProfitLine } from "@/app/api/analytics/rentabilidad-productos/route";

export type ProfitabilityResumen = {
  totalRevenue: number;
  totalCogs: number;
  totalMargin: number;
  marginPct: number;
  totalUnits: number;
};

type ApiResponse = {
  lines: ProductProfitLine[];
  periodDays: number;
  since: string;
  resumen: ProfitabilityResumen;
};

const VACIO: ProfitabilityResumen = {
  totalRevenue: 0,
  totalCogs: 0,
  totalMargin: 0,
  marginPct: 0,
  totalUnits: 0,
};

/**
 * Margen bruto por producto del tenant, de `/api/analytics/rentabilidad-productos`.
 *
 * @param days — Ventana en días (el endpoint la topea en 365).
 */
export function useProductProfitability(days = 30) {
  const [lines, setLines] = useState<ProductProfitLine[]>([]);
  const [resumen, setResumen] = useState<ProfitabilityResumen>(VACIO);
  const [since, setSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/analytics/rentabilidad-productos?days=${days}`, {
          credentials: "include",
          signal,
        });
        if (!res.ok) {
          throw new Error(
            res.status === 503
              ? "No se pudo leer la base de datos"
              : `No se pudo cargar la rentabilidad (${res.status})`
          );
        }
        const data = (await res.json()) as ApiResponse;
        setLines(data.lines ?? []);
        setResumen(data.resumen ?? VACIO);
        setSince(data.since ?? null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
        setLines([]);
        setResumen(VACIO);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [days]
  );

  useEffect(() => {
    const ac = new AbortController();
    cargar(ac.signal);
    return () => ac.abort();
  }, [cargar]);

  return { lines, resumen, since, loading, error, refetch: () => cargar() };
}
