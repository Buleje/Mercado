"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Loader2, AlertCircle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriod } from "@/components/admin/unified/AnalyticsBIModule";

// ── Types ────────────────────────────────────────────────────────────────────

interface HourData {
  hour: number;
  count: number;
}

interface DayData {
  day: string;
  count: number;
}

interface PeakHoursPayload {
  byHour: HourData[];
  byDay: DayData[];
}

const DAY_LABELS: Record<string, string> = {
  lunes: "Lun",
  martes: "Mar",
  miercoles: "Mié",
  jueves: "Jue",
  viernes: "Vie",
  sabado: "Sáb",
  domingo: "Dom",
};

const DAY_ORDER = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

// ── Component ────────────────────────────────────────────────────────────────

type ViewTab = "horas" | "dias";

export default function PeakHoursTab({ period }: { period?: AnalyticsPeriod }) {
  const [data, setData] = useState<PeakHoursPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("horas");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
      const res = await fetch(`/api/analytics/peak-hours?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
      // Fallback: generate empty structure so UI still renders
      const byHour: HourData[] = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
      const byDay: DayData[] = DAY_ORDER.map(d => ({ day: d, count: 0 }));
      setData({ byHour, byDay });
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm font-bold text-gray-700 dark:text-foreground">Error al cargar datos</p>
        <button onClick={load} className="text-xs text-primary font-bold hover:underline">Reintentar</button>
      </div>
    );
  }

  const byHour = data.byHour ?? [];
  const byDay = (data.byDay ?? []).sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)
  );

  const maxHour = Math.max(1, ...byHour.map(h => h.count));
  const maxDay = Math.max(1, ...byDay.map(d => d.count));

  const isEmpty = byHour.every(h => h.count === 0) && byDay.every(d => d.count === 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Horas Pico de Venta
        </h3>
        <div className="flex bg-gray-100 dark:bg-accent rounded-lg p-0.5">
          <button
            onClick={() => setViewTab("horas")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
              viewTab === "horas"
                ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm"
                : "text-gray-500 dark:text-muted"
            )}
          >
            Por hora
          </button>
          <button
            onClick={() => setViewTab("dias")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold transition-all",
              viewTab === "dias"
                ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm"
                : "text-gray-500 dark:text-muted"
            )}
          >
            Por día
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-400 text-xs px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          No se pudo conectar con el endpoint. Mostrando datos vacíos.
        </div>
      )}

      {isEmpty && !error && (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
          <BarChart3 className="h-8 w-8 text-gray-300 dark:text-muted" />
          <p className="text-xs text-gray-400 dark:text-muted">Sin datos de venta para este periodo</p>
        </div>
      )}

      {/* By Hour Chart */}
      {viewTab === "horas" && !isEmpty && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-muted uppercase tracking-wider mb-4">
            Ventas por hora del dia (0-23h)
          </p>
          <div className="flex items-end gap-1 sm:gap-1.5" style={{ height: 350 }}>
            {byHour.map(h => {
              const pct = (h.count / maxHour) * 100;
              const isTop = h.count === maxHour && h.count > 0;
              const isPeak = h.count >= maxHour * 0.8 && h.count > 0;
              const isValley = h.count > 0 && h.count <= maxHour * 0.2;
              const currentHour = new Date().getHours();
              const isCurrent = h.hour === currentHour;
              return (
                <div
                  key={h.hour}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  style={{ minWidth: 16 }}
                >
                  {/* Tooltip */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 whitespace-nowrap z-10">
                    {h.hour}:00 -- S/ {h.count} ventas
                  </div>
                  {/* Bar */}
                  <div
                    className={cn(
                      "w-full rounded-t-[4px] transition-all",
                      isTop
                        ? "bg-[#f97316]"
                        : isPeak
                          ? "bg-[#f97316]/80"
                          : isValley
                            ? "bg-gray-300 dark:bg-gray-600"
                            : h.count > 0
                              ? "bg-[#0f766e] group-hover:bg-[#0f766e]/80"
                              : "bg-gray-100 dark:bg-surface",
                      isCurrent && "ring-2 ring-[#0f766e] ring-offset-1"
                    )}
                    style={{ height: `${Math.max(pct, 2)}%` }}
                  />
                  {/* Label */}
                  <span className="text-[10px] font-mono text-gray-400 dark:text-muted mt-1.5 leading-none">
                    {h.hour}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Peak hour summary */}
          {byHour.some(h => h.count > 0) && (() => {
            const peak = byHour.reduce((best, h) => h.count > best.count ? h : best, byHour[0]);
            return (
              <p className="text-xs text-gray-500 dark:text-muted mt-3 text-center">
                Hora pico: <span className="font-bold text-primary">{peak.hour}:00 - {peak.hour}:59</span> con {peak.count} ventas
              </p>
            );
          })()}
        </div>
      )}

      {/* By Day Chart */}
      {viewTab === "dias" && !isEmpty && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 sm:p-5">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-muted uppercase tracking-wider mb-4">
            Ventas por dia de la semana
          </p>
          <div className="space-y-3">
            {byDay.map(d => {
              const pct = (d.count / maxDay) * 100;
              const isTop = d.count === maxDay && d.count > 0;
              return (
                <div key={d.day} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 dark:text-muted w-10 text-right shrink-0">
                    {DAY_LABELS[d.day] ?? d.day}
                  </span>
                  <div className="flex-1 bg-gray-100 dark:bg-surface rounded-full h-7 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all flex items-center justify-end pr-3",
                        isTop ? "bg-[#f97316]" : "bg-[#0f766e]/60 dark:bg-[#14b8a6]/50 hover:bg-[#0f766e]/80"
                      )}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    >
                      {pct > 15 && (
                        <span className="text-[10px] font-bold text-white">{d.count}</span>
                      )}
                    </div>
                  </div>
                  {pct <= 15 && (
                    <span className="text-[10px] font-bold text-gray-500 dark:text-muted shrink-0">{d.count}</span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Peak day summary */}
          {byDay.some(d => d.count > 0) && (() => {
            const peak = byDay.reduce((best, d) => d.count > best.count ? d : best, byDay[0]);
            return (
              <p className="text-xs text-gray-500 dark:text-muted mt-3 text-center">
                Día más activo: <span className="font-bold text-primary capitalize">{peak.day}</span> con {peak.count} ventas
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}
