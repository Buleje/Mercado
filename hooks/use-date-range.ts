"use client";

/**
 * useDateRange — hook compartido para filtros de fecha.
 *
 * Ranges soportados: 1d (Hoy), 7d, 30d, 90d, 1y, custom (from-to).
 * Persistencia: localStorage con namespace `superadmin:daterange:${storageKey}`
 * para evitar colisión con otras keys (ej. ChartManager `chart_manager_visible_*`).
 *
 * Uso:
 *   const { range, setRange, start, end, label } = useDateRange("dashboard", "30d");
 *   <DateRangeSelector value={range} onChange={setRange} />
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export type DateRangeValue = "1d" | "7d" | "30d" | "90d" | "1y" | "custom";

export interface DateRangeResult {
  range: DateRangeValue;
  setRange: (r: DateRangeValue) => void;
  customRange: { start: Date; end: Date } | null;
  setCustomRange: (start: Date, end: Date) => void;
  start: Date;
  end: Date;
  /** Etiqueta humana ("Hoy", "7 días", "Personalizado") */
  label: string;
  /** Días equivalentes (para fetches contra APIs que toman ?days=) */
  days: number;
}

const RANGE_DAYS: Record<Exclude<DateRangeValue, "custom">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

const RANGE_LABELS: Record<DateRangeValue, string> = {
  "1d": "Hoy",
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
  "1y": "1 año",
  custom: "Personalizado",
};

function lsKey(storageKey: string): string {
  return `superadmin:daterange:${storageKey}`;
}

function readInitial(storageKey: string, fallback: DateRangeValue): DateRangeValue {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(lsKey(storageKey));
    if (raw && (raw === "1d" || raw === "7d" || raw === "30d" || raw === "90d" || raw === "1y" || raw === "custom")) {
      return raw;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export function useDateRange(
  storageKey: string,
  defaultRange: DateRangeValue = "30d",
): DateRangeResult {
  const [range, setRangeState] = useState<DateRangeValue>(() => readInitial(storageKey, defaultRange));
  const [customRange, setCustomRangeState] = useState<{ start: Date; end: Date } | null>(null);

  // Persist en cada cambio
  useEffect(() => {
    try {
      localStorage.setItem(lsKey(storageKey), range);
    } catch {
      // ignore quota errors
    }
  }, [range, storageKey]);

  const setRange = useCallback((r: DateRangeValue) => setRangeState(r), []);

  const setCustomRange = useCallback((start: Date, end: Date) => {
    setCustomRangeState({ start, end });
    setRangeState("custom");
  }, []);

  const { start, end, days, label } = useMemo(() => {
    const now = new Date();
    if (range === "custom" && customRange) {
      const ms = customRange.end.getTime() - customRange.start.getTime();
      const daysDiff = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
      return {
        start: customRange.start,
        end: customRange.end,
        days: daysDiff,
        label: RANGE_LABELS.custom,
      };
    }
    const d = RANGE_DAYS[(range === "custom" ? "30d" : range) as Exclude<DateRangeValue, "custom">];
    const s = new Date(now);
    s.setHours(0, 0, 0, 0);
    s.setDate(s.getDate() - d);
    return { start: s, end: now, days: d, label: RANGE_LABELS[range] };
  }, [range, customRange]);

  return { range, setRange, customRange, setCustomRange, start, end, label, days };
}
