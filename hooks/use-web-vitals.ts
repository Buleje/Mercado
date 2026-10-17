"use client";

/**
 * useWebVitals — Core Web Vitals reales del navegador actual vía
 * PerformanceObserver buffered (la única forma honesta: getEntriesByType
 * devuelve vacío para layout-shift/LCP sin observer — bug que tenía el
 * historial viejo de RendimientoModule).
 *
 * null = sin dato todavía (no calificar como "bueno" un valor ausente).
 */

import { useEffect, useState } from "react";

export interface WebVitals {
  /** Largest Contentful Paint, en segundos. */
  lcp: number | null;
  /** Cumulative Layout Shift (unitless). */
  cls: number | null;
  /** Interaction to Next Paint aprox (event timing), en ms. */
  inp: number | null;
}

/** Umbrales oficiales [bueno, pobre] — web.dev/vitals. */
export const VITALS_THRESHOLDS = {
  lcp: [2.5, 4] as const,
  cls: [0.1, 0.25] as const,
  inp: [200, 500] as const,
};

export type VitalGrade = "bueno" | "regular" | "pobre" | "sin-dato";

export function gradeVital(
  value: number | null,
  [good, poor]: readonly [number, number],
): VitalGrade {
  if (value == null) return "sin-dato";
  if (value <= good) return "bueno";
  if (value <= poor) return "regular";
  return "pobre";
}

/**
 * Score 0-100 estilo Lighthouse simplificado: sub-score lineal por métrica
 * (100 en el umbral "bueno", 0 en "pobre") ponderado LCP 40% / CLS 30% /
 * INP 30%. Solo pondera métricas CON dato; null si no hay ninguna.
 */
export function scoreVitals(v: WebVitals): number | null {
  const sub = (value: number | null, [good, poor]: readonly [number, number]) =>
    value == null
      ? null
      : Math.round(100 * (1 - Math.min(1, Math.max(0, (value - good) / (poor - good)))));
  const parts = [
    { s: sub(v.lcp, VITALS_THRESHOLDS.lcp), w: 0.4 },
    { s: sub(v.cls, VITALS_THRESHOLDS.cls), w: 0.3 },
    { s: sub(v.inp, VITALS_THRESHOLDS.inp), w: 0.3 },
  ].filter((p): p is { s: number; w: number } => p.s != null);
  if (parts.length === 0) return null;
  const wSum = parts.reduce((a, p) => a + p.w, 0);
  return Math.round(parts.reduce((a, p) => a + p.s * p.w, 0) / wSum);
}

export function useWebVitals(): WebVitals {
  const [vitals, setVitals] = useState<WebVitals>({ lcp: null, cls: null, inp: null });

  useEffect(() => {
    const observers: PerformanceObserver[] = [];

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) setVitals((m) => ({ ...m, lcp: last.startTime / 1000 }));
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcpObserver);
    } catch { /* no soportado */ }

    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!e.hadRecentInput) clsValue += e.value ?? 0;
        }
        setVitals((m) => ({ ...m, cls: Math.round(clsValue * 1000) / 1000 }));
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      observers.push(clsObserver);
    } catch { /* no soportado */ }

    try {
      let maxInp = 0;
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const duration = (entry as PerformanceEntry & { duration?: number }).duration ?? 0;
          if (duration > maxInp) {
            maxInp = duration;
            setVitals((m) => ({ ...m, inp: maxInp }));
          }
        }
      });
      inpObserver.observe({ type: "event", buffered: true });
      observers.push(inpObserver);
    } catch { /* no soportado */ }

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return vitals;
}
