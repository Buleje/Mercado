"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HeatCell } from "@/app/api/analytics/heatmap/route";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(ratio: number): string {
  if (ratio > 0.85) return "bg-red-500 text-white";
  if (ratio > 0.65) return "bg-orange-400 text-white";
  if (ratio > 0.45) return "bg-yellow-400 text-gray-900";
  if (ratio > 0.25) return "bg-emerald-300 text-gray-900";
  if (ratio > 0.05) return "bg-emerald-100 dark:bg-emerald-900/30 text-gray-600 dark:text-gray-300";
  return "bg-gray-100 dark:bg-surface text-gray-400";
}

type Tooltip = { x: number; y: number; day: string; hour: number; value: number; amount: number } | null;

export default function HeatMapTab() {
  const [cells, setCells] = useState<HeatCell[]>([]);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip>(null);
  const [isDemo, setIsDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/heatmap?period=${period}`);
      if (!res.ok) throw new Error("Error al cargar datos");
      const data = await res.json();
      setCells(data.cells ?? []);
      setIsDemo(!!data.demo);
    } catch {
      setError("No se pudo cargar el mapa de calor");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const maxValue = Math.max(...cells.map(c => c.value), 1);
  const totalTx = cells.reduce((s, c) => s + c.value, 0);

  const peakHour = HOURS.reduce((best, h) => {
    const sum = cells.filter(c => c.hour === h).reduce((s, c) => s + c.value, 0);
    return sum > best.sum ? { hour: h, sum } : best;
  }, { hour: 0, sum: 0 });

  const peakDay = DAYS.reduce((best, d) => {
    const sum = cells.filter(c => c.day === d).reduce((s, c) => s + c.value, 0);
    return sum > best.sum ? { day: d, sum } : best;
  }, { day: "Lun", sum: 0 });

  const totalAmount = cells.reduce((s, c) => s + c.amount, 0);

  // Horas con actividad para columnas visibles
  const activeHours = HOURS.filter(h => cells.some(c => c.hour === h && c.value > 0));
  const displayHours = activeHours.length > 0 ? activeHours : HOURS.slice(7, 21);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Mapa de Calor
            {isDemo && <span className="text-xs font-normal text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">datos demo</span>}
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Patrones de ventas por hora y día de la semana</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["7d", "30d", "90d"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                period === p ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>
              {p === "7d" ? "7 días" : p === "30d" ? "30 días" : "90 días"}
            </button>
          ))}
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface text-gray-400 transition-colors">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Transacciones totales", value: totalTx.toLocaleString(), color: "text-emerald-500" },
          { label: "Hora pico", value: `${peakHour.hour}:00`, color: "text-emerald-500" },
          { label: "Día más activo", value: peakDay.day, color: "text-[var(--text-secondary)]" },
          { label: "Monto total", value: `S/ ${totalAmount.toFixed(0)}`, color: "text-amber-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            {loading
              ? <div className="h-7 w-20 bg-gray-100 dark:bg-surface rounded animate-pulse mt-1" />
              : <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>}
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5 overflow-x-auto relative">
        <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-4">
          Transacciones por hora y día de la semana
        </h3>

        {error ? (
          <div className="flex items-center justify-center h-40 text-sm text-red-500">{error}</div>
        ) : loading ? (
          <div className="min-w-[500px] space-y-1.5">
            {DAYS.map(d => (
              <div key={d} className="flex gap-1 items-center">
                <div className="w-10 h-4 bg-gray-100 dark:bg-surface rounded" />
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className="flex-1 h-8 bg-gray-100 dark:bg-surface rounded animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="min-w-[520px]">
            <div className="grid" style={{ gridTemplateColumns: `44px repeat(${displayHours.length}, 1fr)` }}>
              <div />
              {displayHours.map(h => (
                <div key={h} className="text-center text-[length:var(--ts-2xs)] font-bold text-gray-400 pb-1">{h}h</div>
              ))}
              {DAYS.map(day => (
                <div key={day} className="contents">
                  <div className="text-xs font-bold text-gray-500 dark:text-muted flex items-center pr-2">{day}</div>
                  {displayHours.map(hour => {
                    const cell = cells.find(c => c.day === day && c.hour === hour);
                    const val = cell?.value ?? 0;
                    const ratio = val / maxValue;
                    return (
                      <div
                        key={`${day}-${hour}`}
                        className={cn("m-0.5 rounded-md flex items-center justify-center text-[length:var(--ts-2xs)] font-bold h-8 cursor-default transition-all hover:ring-2 hover:ring-primary/50", getColor(ratio))}
                        onMouseEnter={e => {
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setTooltip({ x: rect.left, y: rect.top, day, hour, value: val, amount: cell?.amount ?? 0 });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {val > 0 ? val : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap items-center gap-2 mt-4 justify-center">
              <span className="text-[length:var(--ts-2xs)] text-gray-400">Menos</span>
              {["bg-emerald-100", "bg-emerald-300", "bg-yellow-400", "bg-orange-400", "bg-red-500"].map((c, i) => (
                <div key={i} className={cn("h-4 w-6 rounded", c)} />
              ))}
              <span className="text-[length:var(--ts-2xs)] text-gray-400">Más</span>
            </div>
          </div>
        )}

        {/* Tooltip flotante */}
        {tooltip && (
          <div
            className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2"
            style={{ left: tooltip.x + 8, top: tooltip.y - 56 }}
          >
            <p className="font-bold">{tooltip.day} {tooltip.hour}:00</p>
            <p>{tooltip.value} transacciones</p>
            <p className="text-emerald-300">S/ {tooltip.amount.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Resumen por día */}
      {!loading && !error && cells.length > 0 && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3">Resumen por día</h3>
          <div className="space-y-2">
            {DAYS.map(day => {
              const dayTotal = cells.filter(c => c.day === day).reduce((s, c) => s + c.value, 0);
              const dayAmount = cells.filter(c => c.day === day).reduce((s, c) => s + c.amount, 0);
              const ratio = totalTx > 0 ? dayTotal / totalTx : 0;
              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 dark:text-muted w-8">{day}</span>
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 dark:text-foreground w-10 text-right">{dayTotal}</span>
                  <span className="text-xs text-gray-400 w-24 text-right">S/ {dayAmount.toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
