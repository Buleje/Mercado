"use client";

/**
 * useCustomerPerf — resumen de la experiencia REAL de los clientes (RUM),
 * últimos 7 días, desde /api/admin/perf-history. Convierte el rollup diario
 * en promedios por métrica + score 0-100 (mismo scorer que el velocímetro
 * del dispositivo, para comparar peras con peras).
 *
 * Unidades del rollup: lcp/inp/ttfb en ms, cls sin unidad. scoreVitals espera
 * lcp en segundos → se convierte antes de puntuar.
 */

import { useEffect, useState } from "react";
import { scoreVitals, type WebVitals } from "@/hooks/use-web-vitals";

interface DayAgg {
  sum: number;
  n: number;
  good: number;
  regular: number;
  poor: number;
}
type Day = Partial<Record<"lcp" | "cls" | "inp" | "ttfb", DayAgg>>;

export interface CustomerPerf {
  /** Promedios de los últimos 7 días (ms; cls sin unidad). null = sin dato. */
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  /** Score 0-100 de la experiencia del cliente. null = sin visitas. */
  score: number | null;
  /** Visitas medidas en la ventana. */
  visits: number;
  loading: boolean;
  error: boolean;
}

function avg7(days: Record<string, Day>, metric: "lcp" | "cls" | "inp"): number | null {
  const keys = Object.keys(days).sort().slice(-7);
  let sum = 0;
  let n = 0;
  for (const k of keys) {
    const agg = days[k]?.[metric];
    if (agg && agg.n > 0) {
      sum += agg.sum;
      n += agg.n;
    }
  }
  return n > 0 ? sum / n : null;
}

export function useCustomerPerf(): CustomerPerf {
  const [state, setState] = useState<CustomerPerf>({
    lcpMs: null,
    cls: null,
    inpMs: null,
    score: null,
    visits: 0,
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/perf-history", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return;
        const days = (json?.days as Record<string, Day>) ?? {};
        const lcpMs = avg7(days, "lcp");
        const cls = avg7(days, "cls");
        const inpMs = avg7(days, "inp");
        const keys = Object.keys(days).sort().slice(-7);
        const visits = keys.reduce((acc, k) => acc + (days[k]?.lcp?.n ?? 0), 0);
        const forScore: WebVitals = {
          lcp: lcpMs == null ? null : lcpMs / 1000,
          cls,
          inp: inpMs,
        };
        setState({
          lcpMs,
          cls,
          inpMs,
          score: scoreVitals(forScore),
          visits,
          loading: false,
          error: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
