"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

// New endpoint shape: matrix[dow][hour] = { avgTotal, count }
interface HeatmapV2Response {
  matrix: Record<number, Record<number, { avgTotal: number; count: number }>>;
  peakSlot: { dow: number; hour: number; avgTotal: number };
  insight: string;
}

// Fallback endpoint shape (from /api/analytics/heatmap)
interface HeatCellV1 {
  hour: number;
  day: string;
  value: number;
  amount: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Backend uses JS getDay(): 0=Dom, 1=Lun, ..., 6=Sab
const DOW_LABELS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"] as const;
// Display order: Lun-Dom
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getColor(value: number, max: number): string {
  if (!value || max === 0) return "bg-gray-50 dark:bg-gray-800";
  const pct = value / max;
  if (pct < 0.15) return "bg-emerald-100 dark:bg-emerald-900/30";
  if (pct < 0.35) return "bg-emerald-300 dark:bg-emerald-700";
  if (pct < 0.55) return "bg-emerald-500 dark:bg-emerald-500";
  if (pct < 0.8) return "bg-emerald-700 dark:bg-emerald-400 text-white";
  return "bg-emerald-900 dark:bg-emerald-300 text-white";
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VentasHeatmap() {
  const [v2Data, setV2Data] = useState<HeatmapV2Response | null>(null);
  const [v1Cells, setV1Cells] = useState<HeatCellV1[]>([]);
  const [isV2, setIsV2] = useState(false);
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(false);
      // Try new heatmap endpoint first
      const res = await fetch("/api/analytics/ventas-heatmap?days=60", { credentials: "include" });

      if (res.ok) {
        const json: HeatmapV2Response = await res.json();
        setV2Data(json);
        setIsV2(true);
        setInsight(json.insight ?? "");
        return;
      }

      // Fallback to old heatmap endpoint
      const fallbackRes = await fetch("/api/analytics/heatmap?period=90d", { credentials: "include" });
      if (!fallbackRes.ok) throw new Error("fetch failed");
      const json = await fallbackRes.json();
      setV1Cells(json.cells ?? []);
      setIsV2(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build unified grid from either response shape
  const { grid, maxValue, peakDow, peakHour } = useMemo(() => {
    const gridMap = new Map<string, { avgTotal: number; count: number }>();
    let max = 0;
    let peakD = 6; // Sab
    let peakH = 18;

    if (isV2 && v2Data) {
      // V2: matrix[dow][hour]
      for (const dowStr of Object.keys(v2Data.matrix)) {
        const dow = Number(dowStr);
        const hours = v2Data.matrix[dow];
        for (const hourStr of Object.keys(hours)) {
          const hour = Number(hourStr);
          const cell = hours[hour];
          gridMap.set(`${dow}::${hour}`, cell);
          if (cell.avgTotal > max) {
            max = cell.avgTotal;
          }
        }
      }
      peakD = v2Data.peakSlot.dow;
      peakH = v2Data.peakSlot.hour;
    } else {
      // V1 fallback: cells with day name strings
      const dayNameToDow: Record<string, number> = {
        "Dom": 0, "Lun": 1, "Mar": 2, "Mié": 3, "Mie": 3,
        "Jue": 4, "Vie": 5, "Sáb": 6, "Sab": 6,
      };
      let peakVal = 0;
      for (const cell of v1Cells) {
        const dow = dayNameToDow[cell.day] ?? 0;
        gridMap.set(`${dow}::${cell.hour}`, { avgTotal: cell.amount, count: cell.value });
        if (cell.amount > peakVal) {
          peakVal = cell.amount;
          peakD = dow;
          peakH = cell.hour;
        }
        if (cell.amount > max) max = cell.amount;
      }
    }

    return { grid: gridMap, maxValue: max, peakDow: peakD, peakHour: peakH };
  }, [isV2, v2Data, v1Cells]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse" />
        <div className="space-y-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-1">
              <div className="w-8 h-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              {Array.from({ length: 9 }).map((_, j) => (
                <div key={j} className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-sm animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 flex flex-col items-center justify-center h-64">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">No se pudo cargar el mapa de calor</p>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 transition-colors"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Reintentar
        </button>
      </div>
    );
  }

  // ── Empty ──
  if (grid.size === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 flex items-center justify-center h-64">
        <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos para el mapa de calor</p>
      </div>
    );
  }

  const _insightText = insight || `Tu hora pico es los ${DOW_LABELS[peakDow]} a las ${formatHour(peakHour)}. Asegurate de tener personal suficiente en ese horario.`;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        Mapa de Calor de Ventas
      </h3>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-fit">
          {/* X-axis labels */}
          <div className="flex ml-12 mb-1.5 gap-1">
            {HOURS.map((h) => (
              <div
                key={h}
                className="w-9 text-center text-[10px] font-mono text-gray-400 dark:text-gray-500"
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          {/* Rows: Lun → Dom */}
          {DOW_ORDER.map((dow) => (
            <div key={dow} className="flex items-center gap-1 mb-1">
              <span className="w-10 text-right text-xs text-gray-500 dark:text-gray-400 font-medium pr-1">
                {DOW_LABELS[dow]}
              </span>
              {HOURS.map((hour) => {
                const cell = grid.get(`${dow}::${hour}`);
                const avgTotal = cell?.avgTotal ?? 0;
                const count = cell?.count ?? 0;
                return (
                  <div
                    key={hour}
                    className={cn(
                      "w-9 h-9 rounded-md transition-all cursor-default hover:ring-2 hover:ring-[#0f766e] hover:shadow-md",
                      getColor(avgTotal, maxValue)
                    )}
                    title={`${DOW_LABELS[dow]} ${formatHour(hour)}\nS/ ${avgTotal.toFixed(0)} promedio\n${count} ventas`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-5">
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Menor</span>
        <div className="flex w-48 h-4 rounded-full overflow-hidden">
          <div className="flex-1 bg-gray-50 dark:bg-gray-800" />
          <div className="flex-1 bg-emerald-100 dark:bg-emerald-900/30" />
          <div className="flex-1 bg-emerald-300 dark:bg-emerald-700" />
          <div className="flex-1 bg-emerald-500 dark:bg-emerald-500" />
          <div className="flex-1 bg-emerald-700 dark:bg-emerald-400" />
          <div className="flex-1 bg-emerald-900 dark:bg-emerald-300" />
        </div>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Mayor</span>
      </div>

      {/* Mejora 20: Analisis de horario optimo */}
      {(() => {
        // Encontrar mejor y peor horario
        let bestSlot = { dow: 0, hour: 0, avg: 0, count: 0 };
        let worstSlot = { dow: 0, hour: 0, avg: Infinity, count: 0 };
        const businessHours = [6, 8, 10, 12, 14, 16, 18, 20]; // horario laboral

        for (const dow of DOW_ORDER) {
          for (const hour of HOURS) {
            const cell = grid.get(`${dow}::${hour}`);
            if (!cell) continue;
            if (cell.avgTotal > bestSlot.avg) {
              bestSlot = { dow, hour, avg: cell.avgTotal, count: cell.count };
            }
            if (cell.avgTotal > 0 && cell.avgTotal < worstSlot.avg && businessHours.includes(hour)) {
              worstSlot = { dow, hour, avg: cell.avgTotal, count: cell.count };
            }
          }
        }
        if (worstSlot.avg === Infinity) worstSlot = { dow: 0, hour: 0, avg: 0, count: 0 };

        const isBusinessHour = (h: number) => h >= 8 && h <= 20;
        const bestIsQuincena = bestSlot.dow === 1 || bestSlot.dow === 3; // Lun o Mie (quincenas tipicas)

        return (
          <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-r-lg space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-blue-800 dark:text-blue-300">Analisis de Horario</span>
            </div>
            <div className="space-y-2 text-xs text-blue-800 dark:text-blue-300">
              {bestSlot.avg > 0 && (
                <p>
                  <span className="font-bold">Tu mejor horario:</span> {DOW_LABELS[bestSlot.dow]} a las {formatHour(bestSlot.hour)} — promedio S/ {bestSlot.avg.toFixed(0)} ({bestSlot.count} ventas)
                </p>
              )}
              {worstSlot.avg > 0 && (
                <p>
                  <span className="font-bold">Horario mas bajo:</span> {DOW_LABELS[worstSlot.dow]} a las {formatHour(worstSlot.hour)} — promedio S/ {worstSlot.avg.toFixed(0)}
                </p>
              )}
              {worstSlot.avg > 0 && isBusinessHour(worstSlot.hour) && (
                <p className="bg-blue-100 dark:bg-blue-800/30 rounded-lg p-2">
                  <span className="font-bold">Sugerencia:</span> Considera una promocion especial los {DOW_LABELS[worstSlot.dow]} a las {formatHour(worstSlot.hour)} para impulsar ventas
                </p>
              )}
              {bestIsQuincena && bestSlot.avg > 0 && (
                <p className="bg-blue-100 dark:bg-blue-800/30 rounded-lg p-2">
                  <span className="font-bold">Tus picos coinciden con inicio de semana — prepara stock extra esos dias</span>
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
