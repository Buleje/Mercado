"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type HeatCell = {
  hour: number;
  day: string;
  value: number;   // sale count
  amount: number;  // total S/
};

type ApiCell = {
  hour: number;
  day: string;
  value: number;
  amount: number;
};

type TooltipState = {
  day: string;
  hour: number;
  count: number;
  amount: number;
  x: number;
  y: number;
} | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const HOURS_START = 6;
const HOURS_END = 22; // 6am to 10pm

function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

// ─── Color scale ──────────────────────────────────────────────────────────────

function heatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-gray-100 dark:bg-gray-800";
  const ratio = value / max;
  if (ratio >= 0.85) return "bg-[#1b4332]";
  if (ratio >= 0.65) return "bg-[#2d6a4f]";
  if (ratio >= 0.45) return "bg-[#40916c]";
  if (ratio >= 0.25) return "bg-[#74c69d]";
  return "bg-[#b7e4c7] dark:bg-[#1b4332]/40";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SalesHeatmap() {
  const [cells, setCells] = useState<HeatCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/heatmap?period=${period}`);
      if (!res.ok) throw new Error("Error al cargar datos");
      const data = await res.json() as ApiCell[];
      setCells(data);
    } catch {
      setError("No se pudo cargar el mapa de calor");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // Build lookup map
  const cellMap = new Map<string, HeatCell>();
  for (const c of cells) {
    cellMap.set(`${c.day}::${c.hour}`, c);
  }

  // Max value for color scaling
  const maxCount = Math.max(...cells.map((c) => c.value), 1);

  // Best hour/day
  const bestCell = cells.reduce<HeatCell | null>(
    (best, c) => (!best || c.amount > best.amount ? c : best),
    null
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-500">
        <RefreshCw className="h-5 w-5 animate-spin" />
        Cargando mapa de calor...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-6 text-sm text-red-600 dark:text-red-400">
        {error}
        <button onClick={load} className="ml-3 underline">Reintentar</button>
      </div>
    );
  }

  const hours = Array.from({ length: HOURS_END - HOURS_START + 1 }, (_, i) => HOURS_START + i);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Mapa de calor de ventas
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cuando se vende mas — util para planear personal y stock
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  period === p
                    ? "bg-[#2d6a4f] text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Best slot insight */}
      {bestCell && bestCell.amount > 0 && (
        <div className="rounded-xl border border-[#2d6a4f]/30 bg-[#2d6a4f]/5 px-5 py-3 text-sm text-[#2d6a4f] dark:text-green-400">
          Hora pico: <strong>{bestCell.day} {hourLabel(bestCell.hour)}</strong> &mdash;{" "}
          {formatCurrency(bestCell.amount)} en {bestCell.value} venta{bestCell.value !== 1 ? "s" : ""}
        </div>
      )}

      {/* Heatmap grid */}
      <div className="relative overflow-x-auto">
        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
          >
            <p className="font-medium text-gray-800 dark:text-gray-200">
              {tooltip.day} {hourLabel(tooltip.hour)}
            </p>
            <p className="text-gray-500">
              {formatCurrency(tooltip.amount)} &middot; {tooltip.count} venta{tooltip.count !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="w-12 pr-2 text-right font-medium text-gray-400 dark:text-gray-500" />
              {hours.map((h) => (
                <th key={h} className="px-0.5 pb-2 text-center font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {hourLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day}>
                <td className="pr-3 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap py-0.5">
                  {day}
                </td>
                {hours.map((hour) => {
                  const cell = cellMap.get(`${day}::${hour}`);
                  const count = cell?.value ?? 0;
                  const amount = cell?.amount ?? 0;

                  return (
                    <td key={hour} className="p-0.5">
                      <div
                        onMouseEnter={(e) => setTooltip({ day, hour, count, amount, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                        onMouseMove={(e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                        className={cn(
                          "h-8 w-full min-w-[2rem] rounded cursor-default transition-opacity hover:opacity-80",
                          heatColor(count, maxCount)
                        )}
                        title={`${day} ${hourLabel(hour)}: ${formatCurrency(amount)} (${count} ventas)`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Menos ventas</span>
        <div className="flex gap-1">
          {["bg-gray-100 dark:bg-gray-800", "bg-[#b7e4c7]", "bg-[#74c69d]", "bg-[#40916c]", "bg-[#2d6a4f]", "bg-[#1b4332]"].map((cls, i) => (
            <div key={i} className={cn("h-4 w-6 rounded", cls)} />
          ))}
        </div>
        <span>Mas ventas</span>
      </div>
    </div>
  );
}
