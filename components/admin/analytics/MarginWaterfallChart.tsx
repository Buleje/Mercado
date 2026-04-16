"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarginProduct {
  productId: number;
  name: string;
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
  units: number;
}

interface MarginSummary {
  totalRevenue: number;
  totalCost: number;
  totalGrossProfit: number;
  overallMarginPct: number;
  productsWithCost: number;
  productsWithoutCost: number;
}

interface MarginResponse {
  products: MarginProduct[];
  summary: MarginSummary;
}

interface WaterfallBar {
  name: string;
  value: number;
  displayValue: number;
  base: number;
  fill: string;
  label: string;
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WaterfallBar }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 min-w-[160px]">
      <p className="text-xs font-semibold text-gray-900 dark:text-white mb-1.5">{d.name}</p>
      <p className="text-xs text-gray-500 flex justify-between gap-4">
        <span>Monto</span>
        <span className="font-mono font-medium" style={{ color: d.fill }}>S/ {d.displayValue.toFixed(2)}</span>
      </p>
      <p className="text-xs text-gray-500 flex justify-between gap-4">
        <span>% del total</span>
        <span className="font-mono font-medium text-gray-400">{d.label}</span>
      </p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MarginWaterfallChart() {
  const [data, setData] = useState<MarginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showBest, setShowBest] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setError(false);
      const res = await fetch("/api/analytics/margins", { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Waterfall data ──
  const waterfallData = useMemo((): WaterfallBar[] => {
    if (!data) return [];
    const { totalRevenue, totalCost, totalGrossProfit } = data.summary;
    const gastos = totalRevenue * 0.1; // Estimate operational expenses as ~10%
    const margen = totalGrossProfit - gastos;

    return [
      {
        name: "Ingresos",
        value: totalRevenue,
        displayValue: totalRevenue,
        base: 0,
        fill: "#00B4A6",
        label: "100%",
      },
      {
        name: "-Costo mercancia",
        value: totalCost,
        displayValue: totalCost,
        base: totalRevenue - totalCost,
        fill: "#e63946",
        label: `${((totalCost / totalRevenue) * 100).toFixed(1)}%`,
      },
      {
        name: "-Gastos",
        value: gastos,
        displayValue: gastos,
        base: totalRevenue - totalCost - gastos,
        fill: "#f97316",
        label: `~10%`,
      },
      {
        name: "= Margen",
        value: Math.max(0, margen),
        displayValue: margen,
        base: 0,
        fill: margen >= 0 ? "#00B4A6" : "#e63946",
        label: `${((margen / totalRevenue) * 100).toFixed(1)}%`,
      },
    ];
  }, [data]);

  // ── Top/Bottom products ──
  const rankedProducts = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.products].sort((a, b) =>
      showBest ? b.marginPct - a.marginPct : a.marginPct - b.marginPct
    );
    return sorted.slice(0, 10);
  }, [data, showBest]);

  const maxMarginPct = useMemo(
    () => Math.max(...(rankedProducts.map((p) => Math.abs(p.marginPct))), 1),
    [rankedProducts]
  );

  // ── Loading ──
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse" />
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          <div className="flex-1 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 flex flex-col items-center justify-center h-64">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">No se pudieron cargar los datos de margenes</p>
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
  if (!data || !data.products.length) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 flex items-center justify-center h-64">
        <p className="text-sm text-gray-500 dark:text-gray-400">No hay datos suficientes de margenes</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        Cascada de Margenes
      </h3>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT: Waterfall chart */}
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={waterfallData} margin={{ top: 20, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip content={<WaterfallTooltip />} />

              {/* Invisible base bar */}
              <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
              {/* Visible value bar */}
              <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={48}>
                {waterfallData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* RIGHT: Top/Bottom products */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setShowBest(true)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                showBest
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              Mejores
            </button>
            <button
              onClick={() => setShowBest(false)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                !showBest
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              Peores
            </button>
          </div>

          <div className="space-y-2.5">
            {rankedProducts.map((product) => {
              const barWidth = Math.max(2, (Math.abs(product.marginPct) / maxMarginPct) * 100);
              const barColor =
                product.marginPct > 20
                  ? "bg-[#00B4A6]"
                  : product.marginPct > 10
                  ? "bg-[#f97316]"
                  : "bg-[#e63946]";

              return (
                <div key={product.productId} className="flex items-center gap-2 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-gray-700 dark:text-gray-300 truncate mr-2 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                        {product.name}
                      </span>
                      <span
                        className={cn("text-xs font-mono font-bold shrink-0", product.marginPct > 20 ? "text-[#00B4A6]" : product.marginPct > 10 ? "text-[#f97316]" : "text-[#e63946]")}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {product.marginPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", barColor)}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
