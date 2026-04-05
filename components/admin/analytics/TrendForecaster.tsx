"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Sale } from "@/types/erp";

// ── Types ──────────────────────────────────────────────────────────────────────
interface TrendForecasterProps {
  sales: Sale[];
}

interface DayPoint {
  date: string;       // YYYY-MM-DD
  label: string;      // "15 ene"
  actual: number;
  ma7: number;        // 7-day moving average
  trend: number;      // linear regression value
  isForecast: boolean;
}

// ── Math helpers ───────────────────────────────────────────────────────────────
function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  const ssXX = values.reduce((s, _, i) => s + (i - xMean) ** 2, 0);
  const ssXY = values.reduce((s, v, i) => s + (i - xMean) * (v - yMean), 0);
  const slope = ssXX !== 0 ? ssXY / ssXX : 0;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

function fmt(n: number) {
  if (n >= 1_000) return `S/${(n / 1_000).toFixed(1)}k`;
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function TrendForecaster({ sales }: TrendForecasterProps) {
  const { points, forecastRange, trendDir } = useMemo(() => {
    // Aggregate sales by day (last 30 days)
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    const byDay: Record<string, number> = {};

    sales.forEach((sale) => {
      const d = new Date(sale.createdAt);
      if (d >= cutoff) {
        const key = sale.createdAt.slice(0, 10);
        byDay[key] = (byDay[key] ?? 0) + (sale.total ?? 0);
      }
    });

    // Fill all days in the range
    const allDays: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86_400_000);
      allDays.push(d.toISOString().slice(0, 10));
    }
    const actuals = allDays.map((d) => byDay[d] ?? 0);

    // Compute 7-day moving average
    const ma7 = actuals.map((_, i) => {
      const window = actuals.slice(Math.max(0, i - 6), i + 1);
      return window.reduce((s, v) => s + v, 0) / window.length;
    });

    // Linear regression on actuals
    const { slope, intercept } = linearRegression(actuals);

    // Build historical points
    const historicalPoints: DayPoint[] = allDays.map((date, i) => ({
      date,
      label: dayLabel(date),
      actual: actuals[i],
      ma7: ma7[i],
      trend: intercept + slope * i,
      isForecast: false,
    }));

    // Project 7 days forward
    const lastDate = allDays[allDays.length - 1];
    const n = allDays.length;
    const forecastPoints: DayPoint[] = Array.from({ length: 7 }, (_, i) => {
      const projIdx = n + i;
      const projected = Math.max(0, intercept + slope * projIdx);
      const futureDate = addDays(lastDate, i + 1);
      return {
        date: futureDate,
        label: dayLabel(futureDate),
        actual: projected,
        ma7: projected,
        trend: projected,
        isForecast: true,
      };
    });

    const forecastValues = forecastPoints.map((p) => p.actual);
    const forecastMin = Math.min(...forecastValues);
    const forecastMax = Math.max(...forecastValues);
    const forecastRange = { min: forecastMin, max: forecastMax };

    // Only show last 14 days + 7 forecast = 21 bars total for readability
    const visibleHistory = historicalPoints.slice(-14);
    const allPoints = [...visibleHistory, ...forecastPoints];

    return {
      points: allPoints,
      forecastRange,
      trendDir: slope >= 0 ? "up" : "down",
    };
  }, [sales]);

  const maxVal = useMemo(() => Math.max(...points.map((p) => p.actual), 1), [points]);

  const weekForecastTotal = points
    .filter((p) => p.isForecast)
    .reduce((s, p) => s + p.actual, 0);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* KPI row */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Tendencia</p>
          <p
            className={cn(
              "text-sm font-bold",
              trendDir === "up" ? "text-[#00B4A6] dark:text-[#2dd4bf]" : "text-red-600 dark:text-red-400"
            )}
          >
            {trendDir === "up" ? "Al alza" : "A la baja"}
          </p>
        </div>
        <div className="flex-1 rounded-lg bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 border border-[#00B4A6]/30 p-2 text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Proyeccion proxima semana</p>
          <p className="text-xs font-bold text-[#00B4A6] dark:text-[#2dd4bf]">
            {fmt(forecastRange.min)} — {fmt(forecastRange.max)}
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#f97316" }} />
          Ventas reales
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm opacity-40" style={{ backgroundColor: "#00B4A6" }} />
          Proyeccion
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#00B4A6]" />
          Media movil 7d
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-[100px] flex flex-col justify-between text-[9px] text-gray-400 dark:text-gray-500">
          <span>{fmt(maxVal)}</span>
          <span>{fmt(maxVal / 2)}</span>
          <span>S/0</span>
        </div>

        {/* Bars */}
        <div className="ml-8 flex items-end gap-0.5 h-[100px]">
          {points.map((pt) => {
            const heightPct = maxVal > 0 ? (pt.actual / maxVal) * 100 : 0;
            return (
              <div
                key={pt.date}
                className="flex-1 flex flex-col items-center"
                title={`${pt.label}: ${fmt(pt.actual)}${pt.isForecast ? " (proyeccion)" : ""}`}
              >
                <div className="w-full flex flex-col justify-end" style={{ height: "220px" }}>
                  <div
                    className={cn(
                      "w-full rounded-t-sm transition-all duration-300",
                      pt.isForecast ? "opacity-40 border-t border-[#00B4A6]" : "opacity-90"
                    )}
                    style={{
                      height: `${heightPct}%`,
                      minHeight: pt.actual > 0 ? "2px" : "0px",
                      backgroundColor: pt.isForecast ? "#00B4A6" : "#f97316",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* MA7 line overlay — rendered as CSS dots */}
        <div className="ml-8 flex gap-0.5" style={{ height: 0, position: "relative" }}>
          {points.map((pt) => {
            const dotBottom = maxVal > 0 ? (pt.ma7 / maxVal) * 100 : 0;
            return (
              <div key={`ma-${pt.date}`} className="flex-1 relative" style={{ height: "220px" }}>
                <div
                  className="absolute w-1 h-1 rounded-full bg-[#00B4A6] left-1/2 -translate-x-1/2"
                  style={{ bottom: `${dotBottom}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Separator line between history and forecast */}
        <div className="ml-8 flex gap-0.5 mt-1">
          {points.map((pt, i) => (
            <div key={`lbl-${pt.date}`} className="flex-1 text-center">
              {(i === 0 || i === 14 || i === points.length - 1 || i % 7 === 0) && (
                <span
                  className={cn(
                    "text-[8px] leading-none",
                    pt.isForecast
                      ? "text-[#00B4A6] dark:text-[#2dd4bf] font-medium"
                      : "text-gray-400 dark:text-gray-500"
                  )}
                >
                  {pt.label}
                </span>
              )}
              {i === 13 && (
                <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-auto -mt-3" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Weekly forecast detail */}
      <div className="rounded-lg bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 border border-[#00B4A6]/20 p-2">
        <p className="text-xs text-gray-600 dark:text-gray-300 font-medium mb-1">Proyeccion diaria (proxima semana)</p>
        <div className="grid grid-cols-7 gap-0.5">
          {points.filter((p) => p.isForecast).map((pt) => (
            <div key={pt.date} className="text-center">
              <p className="text-[9px] text-gray-400 dark:text-gray-500">{pt.label.slice(0, 5)}</p>
              <p className="text-[10px] font-medium text-[#00B4A6] dark:text-[#2dd4bf]">{fmt(pt.actual)}</p>
            </div>
          ))}
        </div>
        <div className="mt-1 pt-1 border-t border-[#00B4A6]/20 flex justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Total proyectado:</span>
          <span className="font-bold text-[#00B4A6] dark:text-[#2dd4bf]">{fmt(weekForecastTotal)}</span>
        </div>
      </div>
    </div>
  );
}
