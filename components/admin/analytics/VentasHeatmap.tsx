"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw } from "@buleje/design-system/icons";

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
  if (!value || max === 0) return "bg-[var(--surface-sunken)]";
  const pct = value / max;
  if (pct < 0.15) return "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]";
  if (pct < 0.35) return "bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]";
  if (pct < 0.55) return "bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]";
  if (pct < 0.8) return "bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)] text-white";
  return "bg-[var(--accent-muted)] dark:bg-[var(--accent-soft)] text-white";
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

// ─── Component ───────────────────────────────────────────────────────────────

type HeatmapPeriod = "30d" | "60d" | "90d";
const HEATMAP_PILLS: { key: HeatmapPeriod; label: string; days: number }[] = [
  { key: "30d", label: "30D", days: 30 },
  { key: "60d", label: "60D", days: 60 },
  { key: "90d", label: "90D", days: 90 },
];

export default function VentasHeatmap() {
  const [v2Data, setV2Data] = useState<HeatmapV2Response | null>(null);
  const [v1Cells, setV1Cells] = useState<HeatCellV1[]>([]);
  const [isV2, setIsV2] = useState(false);
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [heatPeriod, setHeatPeriod] = useState<HeatmapPeriod>("60d");
  const [hoveredCell, setHoveredCell] = useState<{ dow: number; hour: number; x: number; y: number } | null>(null);

  const fetchData = useCallback(async (days: number) => {
    try {
      setError(false);
      setLoading(true);
      // Try new heatmap endpoint first
      const res = await fetch(`/api/analytics/ventas-heatmap?days=${days}`, { credentials: "include" });

      if (res.ok) {
        const json: HeatmapV2Response = await res.json();
        setV2Data(json);
        setIsV2(true);
        setInsight(json.insight ?? "");
        return;
      }

      // Fallback to old heatmap endpoint
      const fallbackRes = await fetch(`/api/analytics/heatmap?period=${days >= 90 ? "90d" : "30d"}`, { credentials: "include" });
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
    const days = HEATMAP_PILLS.find(p => p.key === heatPeriod)?.days ?? 60;
    fetchData(days);
  }, [heatPeriod, fetchData]);

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
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse" />
        <div className="space-y-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-1">
              <div className="w-8 h-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              {Array.from({ length: 9 }).map((_, j) => (
                <div key={j} className="w-7 h-7 bg-[var(--surface-sunken)] rounded-sm animate-pulse" />
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
      <div className="rounded-xl border border-[var(--data-error)] dark:border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 p-6 flex flex-col items-center justify-center h-64">
        <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)] mb-3">No se pudo cargar el mapa de calor</p>
        <button
          onClick={() => { const days = HEATMAP_PILLS.find(p => p.key === heatPeriod)?.days ?? 60; fetchData(days); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/40 text-[var(--data-error)] dark:text-[var(--data-error)] hover:bg-[var(--data-error)] transition-colors"
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
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 flex items-center justify-center h-64">
        <p className="text-sm text-[var(--text-tertiary)]">No hay datos para el mapa de calor</p>
      </div>
    );
  }

  const _insightText = insight || `Tu hora pico es los ${DOW_LABELS[peakDow]} a las ${formatHour(peakHour)}. Asegurate de tener personal suficiente en ese horario.`;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {/* Header + period pills */}
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
          Mapa de Calor de Ventas
        </CardTitle>
        <div className="flex items-center gap-1">
          {HEATMAP_PILLS.map((p) => (
            <button
              key={p.key}
              onClick={() => setHeatPeriod(p.key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                heatPeriod === p.key
                  ? "bg-gray-900 dark:bg-white text-white dark:text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto relative">
        <div className="inline-block min-w-fit">
          {/* X-axis labels */}
          <div className="flex ml-12 mb-1.5 gap-1">
            {HOURS.map((h) => (
              <div
                key={h}
                className="w-9 text-center text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)]"
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          {/* Rows: Lun → Dom */}
          {DOW_ORDER.map((dow) => (
            <div key={dow} className="flex items-center gap-1 mb-1">
              <span className="w-10 text-right text-xs text-[var(--text-tertiary)] font-medium pr-1">
                {DOW_LABELS[dow]}
              </span>
              {HOURS.map((hour) => {
                const cell = grid.get(`${dow}::${hour}`);
                const avgTotal = cell?.avgTotal ?? 0;
                const _count = cell?.count ?? 0;
                return (
                  <div
                    key={hour}
                    className={cn(
                      "w-9 h-9 rounded-md transition-all cursor-default hover:ring-2 hover:ring-[#00B4A6] hover:shadow-sm",
                      getColor(avgTotal, maxValue)
                    )}
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setHoveredCell({ dow, hour, x: rect.left + rect.width / 2, y: rect.top });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Custom tooltip */}
        {hoveredCell && (() => {
          const cell = grid.get(`${hoveredCell.dow}::${hoveredCell.hour}`);
          return (
            <div
              className="fixed z-50 pointer-events-none"
              style={{ left: hoveredCell.x, top: hoveredCell.y - 8, transform: "translate(-50%, -100%)" }}
            >
              <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] px-4 py-3 min-w-[160px]">
                <p className="text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                  {DOW_LABELS[hoveredCell.dow]} {formatHour(hoveredCell.hour)}
                </p>
                <p className="text-xs text-[var(--text-secondary)] flex justify-between gap-4">
                  <span>Promedio</span>
                  <span className="font-mono font-medium text-[#00B4A6]">S/ {(cell?.avgTotal ?? 0).toFixed(0)}</span>
                </p>
                <p className="text-xs text-[var(--text-secondary)] flex justify-between gap-4">
                  <span>Ventas</span>
                  <span className="font-mono font-medium text-[var(--text-secondary)]">{cell?.count ?? 0}</span>
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-5">
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-medium">Menor</span>
        <div className="flex w-48 h-4 rounded-full overflow-hidden">
          <div className="flex-1 bg-[var(--surface-sunken)]" />
          <div className="flex-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" />
          <div className="flex-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]" />
          <div className="flex-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]" />
          <div className="flex-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]" />
          <div className="flex-1 bg-[var(--accent-muted)] dark:bg-[var(--accent-soft)]" />
        </div>
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-medium">Mayor</span>
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
          <div className="mt-4 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-l-4 border-[var(--data-success)]/30 p-4 rounded-r-lg space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">Analisis de Horario</span>
            </div>
            <div className="space-y-2 text-xs text-[var(--data-success)] dark:text-[var(--data-success)]">
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
                <p className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-2">
                  <span className="font-bold">Sugerencia:</span> Considera una promocion especial los {DOW_LABELS[worstSlot.dow]} a las {formatHour(worstSlot.hour)} para impulsar ventas
                </p>
              )}
              {bestIsQuincena && bestSlot.avg > 0 && (
                <p className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-2">
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
