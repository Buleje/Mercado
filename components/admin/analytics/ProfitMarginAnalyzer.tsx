"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Product, Sale, SaleItem } from "@/types/erp";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ProfitMarginAnalyzerProps {
  products: Product[];
  sales: Sale[];
}

interface ProductMargin {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  margin: number;          // percentage
  revenue: number;         // total revenue from sales
  unitsSold: number;
  quadrant: "star" | "cash" | "question" | "dog";
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

const QUADRANT_META = {
  star:     { label: "Alto volumen + Alto margen",  color: "#00B4A6", bg: "bg-green-100 dark:bg-green-900/30",  text: "text-green-800 dark:text-green-300" },
  cash:     { label: "Alto volumen + Bajo margen",  color: "#f97316", bg: "bg-amber-100 dark:bg-amber-900/30",  text: "text-amber-800 dark:text-amber-300" },
  question: { label: "Bajo volumen + Alto margen",  color: "#3b82f6", bg: "bg-emerald-100 dark:bg-emerald-900/30",    text: "text-emerald-800 dark:text-emerald-300" },
  dog:      { label: "Bajo volumen + Bajo margen",  color: "#ef4444", bg: "bg-red-100 dark:bg-red-900/30",      text: "text-red-800 dark:text-red-300" },
};

// ── Scatter Point ──────────────────────────────────────────────────────────────
function ScatterPoint({
  x,
  y,
  quadrant,
  name,
}: {
  x: number;
  y: number;
  quadrant: ProductMargin["quadrant"];
  name: string;
}) {
  const [hover, setHover] = useState(false);
  const color = QUADRANT_META[quadrant].color;

  return (
    <div
      className="absolute w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 cursor-pointer transition-transform duration-150"
      style={{
        left: `${x}%`,
        bottom: `${y}%`,
        backgroundColor: color,
        transform: hover ? "scale(1.8)" : "scale(1)",
        zIndex: hover ? 10 : 1,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={name}
    >
      {hover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 dark:bg-gray-700 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-20 pointer-events-none">
          {name}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ProfitMarginAnalyzer({ products, sales }: ProfitMarginAnalyzerProps) {
  const [showTop, setShowTop] = useState<"best" | "worst">("best");

  const { items, avgWeightedMargin, maxRevenue } = useMemo(() => {
    // Build revenue map from sales
    const revenueMap: Record<string, { revenue: number; units: number }> = {};
    sales.forEach((sale) => {
      (sale.items ?? []).forEach((item: SaleItem) => {
        const key = String(item.productId ?? item.name ?? "?");
        if (!revenueMap[key]) revenueMap[key] = { revenue: 0, units: 0 };
        revenueMap[key].revenue += (item.price ?? 0) * (item.quantity ?? 1);
        revenueMap[key].units += item.quantity ?? 1;
      });
    });

    const totalRevenue = Object.values(revenueMap).reduce((s, v) => s + v.revenue, 0);

    const result: ProductMargin[] = products
      .filter((p) => typeof p.price === "number" && p.price > 0)
      .map((p) => {
        const price = p.price ?? 0;
        const cost = p.costPrice ?? p.cost ?? price * 0.6; // fallback: assume 60% cost
        const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
        const key = String(p.id);
        const stats = revenueMap[key] ?? { revenue: 0, units: 0 };

        return {
          id: key,
          name: p.name,
          category: p.category ?? "Sin categoria",
          price,
          cost,
          margin: Math.max(0, margin),
          revenue: stats.revenue,
          unitsSold: stats.units,
          quadrant: "dog" as ProductMargin["quadrant"], // will set below
        };
      });

    const maxRev = result.reduce((m, p) => Math.max(m, p.revenue), 0);

    // Determine medians for quadrant assignment
    const medRevenue = totalRevenue / Math.max(result.length, 1);
    const medMargin = result.length > 0 ? result.reduce((s, p) => s + p.margin, 0) / result.length : 50;

    result.forEach((p) => {
      const highVol = p.revenue >= medRevenue;
      const highMargin = p.margin >= medMargin;
      if (highVol && highMargin) p.quadrant = "star";
      else if (highVol && !highMargin) p.quadrant = "cash";
      else if (!highVol && highMargin) p.quadrant = "question";
      else p.quadrant = "dog";
    });

    // Weighted average margin
    const totalRev = result.reduce((s, p) => s + p.revenue, 0);
    const avgWeightedMargin =
      totalRev > 0
        ? result.reduce((s, p) => s + p.margin * p.revenue, 0) / totalRev
        : result.reduce((s, p) => s + p.margin, 0) / Math.max(result.length, 1);

    return { items: result, avgWeightedMargin, maxRevenue: maxRev || 1 };
  }, [products, sales]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => (showTop === "best" ? b.margin - a.margin : a.margin - b.margin));
  }, [items, showTop]);

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Summary row */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 border border-[#00B4A6]/30 p-2 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Margen prom. ponderado</p>
          <p className="text-base font-bold text-[#00B4A6] dark:text-[#2dd4bf]">{fmtPct(avgWeightedMargin)}</p>
        </div>
        <div className="flex-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Productos analizados</p>
          <p className="text-base font-bold text-gray-800 dark:text-foreground">{items.length}</p>
        </div>
      </div>

      {/* Quadrant legend */}
      <div className="grid grid-cols-2 gap-1">
        {(Object.entries(QUADRANT_META) as [ProductMargin["quadrant"], typeof QUADRANT_META[keyof typeof QUADRANT_META]][]).map(([q, meta]) => (
          <div
            key={q}
            className={cn("flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium border", meta.bg, meta.text)}
            style={{ borderColor: meta.color + "60" }}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
            <span className="leading-tight">{meta.label}</span>
          </div>
        ))}
      </div>

      {/* Scatter plot */}
      <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/50">
        {/* Axis labels */}
        <div className="absolute top-1 right-2 text-[9px] text-gray-400 dark:text-gray-500">Margen %</div>
        <div className="absolute bottom-1 right-2 text-[9px] text-gray-400 dark:text-gray-500">Volumen →</div>
        {/* Quadrant dividers */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 border-r border-dashed border-gray-300 dark:border-gray-600" />
          <div className="flex-1" />
        </div>
        <div className="absolute inset-0 flex flex-col">
          <div className="flex-1 border-b border-dashed border-gray-300 dark:border-gray-600" />
          <div className="flex-1" />
        </div>
        {/* Points */}
        <div className="relative h-72 mx-4 my-2">
          {items.map((p) => (
            <ScatterPoint
              key={p.id}
              x={Math.min(95, (p.revenue / maxRevenue) * 95)}
              y={Math.min(90, (p.margin / 100) * 90)}
              quadrant={p.quadrant}
              name={`${p.name} — ${fmtPct(p.margin)}`}
            />
          ))}
        </div>
      </div>

      {/* Top lists */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Top 5</span>
          <button
            onClick={() => setShowTop("best")}
            className={cn(
              "px-2 py-0.5 rounded text-xs border transition-colors",
              showTop === "best"
                ? "bg-[#00B4A6] text-white border-[#00B4A6]"
                : "text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
            )}
          >
            Mejores
          </button>
          <button
            onClick={() => setShowTop("worst")}
            className={cn(
              "px-2 py-0.5 rounded text-xs border transition-colors",
              showTop === "worst"
                ? "bg-red-600 text-white border-red-600"
                : "text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
            )}
          >
            Peores
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {sorted.slice(0, 5).map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
            >
              <span className="w-4 text-xs font-bold text-gray-400 dark:text-gray-500">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-foreground truncate">{p.name}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{p.category}</p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={cn(
                    "text-sm font-bold",
                    p.margin >= 30
                      ? "text-[#00B4A6] dark:text-[#2dd4bf]"
                      : p.margin >= 15
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {fmtPct(p.margin)}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{fmt(p.price)}</p>
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Sin productos con precio configurado</p>
          )}
        </div>
      </div>
    </div>
  );
}
