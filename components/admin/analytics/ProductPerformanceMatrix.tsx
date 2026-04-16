"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Product, Sale, SaleItem } from "@/types/erp";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ProductPerformanceMatrixProps {
  products: Product[];
  sales: Sale[];
}

type BCGQuadrant = "star" | "cow" | "question" | "dog";

interface BCGProduct {
  id: string;
  name: string;
  category: string;
  share: number;       // % of total sales (X axis)
  growth: number;      // % growth vs prior period (Y axis)
  revenue: number;
  quadrant: BCGQuadrant;
  xPct: number;        // normalized 0-100 for plot
  yPct: number;        // normalized 0-100 for plot
}

// ── Config ─────────────────────────────────────────────────────────────────────
const QUADRANT_META: Record<BCGQuadrant, {
  label: string; icon: string; color: string;
  bg: string; text: string; recommendation: string;
}> = {
  star:     { label: "Estrellas",    icon: "↑↑", color: "#00B4A6", bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", recommendation: "Invertir para crecer — alta prioridad" },
  cow:      { label: "Vacas",        icon: "→↑", color: "#f97316", bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-300", recommendation: "Mantener y cosechar — generan caja" },
  question: { label: "Interrogantes",icon: "↑↓", color: "#3b82f6", bg: "bg-emerald-100 dark:bg-emerald-900/30",  text: "text-emerald-800 dark:text-emerald-300",  recommendation: "Evaluar potencial — requieren inversion" },
  dog:      { label: "Perros",       icon: "↓↓", color: "#ef4444", bg: "bg-red-100 dark:bg-red-900/30",    text: "text-red-800 dark:text-red-300",    recommendation: "Reducir o descontinuar" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 1_000) return `S/${(n / 1_000).toFixed(1)}k`;
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ── Bubble Point ───────────────────────────────────────────────────────────────
function BubblePoint({ product }: { product: BCGProduct }) {
  const [hover, setHover] = useState(false);
  const meta = QUADRANT_META[product.quadrant];
  // Size proportional to revenue, clamped
  const size = Math.min(20, Math.max(8, product.share * 2));

  return (
    <div
      className="absolute cursor-pointer transition-transform duration-150"
      style={{
        left: `${product.xPct}%`,
        bottom: `${product.yPct}%`,
        transform: "translate(-50%, 50%)",
        zIndex: hover ? 20 : 1,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="rounded-full border-2 border-white dark:border-gray-800 shadow-sm transition-transform duration-150"
        style={{
          width: size,
          height: size,
          backgroundColor: meta.color,
          transform: hover ? "scale(1.5)" : "scale(1)",
        }}
      />
      {hover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg px-2 py-1.5 text-[10px] whitespace-nowrap z-30 shadow-lg pointer-events-none min-w-[120px]">
          <p className="font-semibold">{product.name}</p>
          <p>Participacion: {product.share.toFixed(1)}%</p>
          <p>Crecimiento: {fmtPct(product.growth)}</p>
          <p>Revenue: {fmt(product.revenue)}</p>
          <p className="mt-0.5 font-medium" style={{ color: meta.color }}>
            {meta.icon} {meta.label}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ProductPerformanceMatrix({ products, sales }: ProductPerformanceMatrixProps) {
  const [activeQuadrant, setActiveQuadrant] = useState<BCGQuadrant | null>(null);

  const bcgProducts = useMemo<BCGProduct[]>(() => {
    // Split sales into two halves for growth calculation
    const sorted = [...sales].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const half = Math.floor(sorted.length / 2);
    const prev = sorted.slice(0, half);
    const curr = sorted.slice(half);

    function sumByProduct(salesSlice: Sale[]): Record<string, number> {
      const map: Record<string, number> = {};
      salesSlice.forEach((sale) => {
        (sale.items ?? []).forEach((item: SaleItem) => {
          const key = String(item.productId ?? item.name ?? "?");
          map[key] = (map[key] ?? 0) + (item.price ?? 0) * (item.quantity ?? 1);
        });
      });
      return map;
    }

    const prevMap = sumByProduct(prev);
    const currMap = sumByProduct(curr);
    const totalCurr = Object.values(currMap).reduce((s, v) => s + v, 0) || 1;

    const result: BCGProduct[] = products
      .filter((p) => currMap[String(p.id)] !== undefined || prevMap[String(p.id)] !== undefined)
      .map((p) => {
        const key = String(p.id);
        const currRev = currMap[key] ?? 0;
        const prevRev = prevMap[key] ?? 0;
        const share = (currRev / totalCurr) * 100;
        const growth = prevRev > 0 ? ((currRev - prevRev) / prevRev) * 100 : currRev > 0 ? 100 : 0;
        return {
          id: key,
          name: p.name,
          category: p.category ?? "Sin categoria",
          share,
          growth,
          revenue: currRev,
          quadrant: "dog" as BCGQuadrant,
          xPct: 0,
          yPct: 0,
        };
      });

    if (result.length === 0) return [];

    // Thresholds
    const avgShare  = result.reduce((s, p) => s + p.share, 0) / result.length;
    const avgGrowth = result.reduce((s, p) => s + p.growth, 0) / result.length;

    // Normalize for plot
    const maxShare  = Math.max(...result.map((p) => p.share), 1);
    const minGrowth = Math.min(...result.map((p) => p.growth));
    const maxGrowth = Math.max(...result.map((p) => p.growth), 0.1);
    const growthRange = maxGrowth - minGrowth || 1;

    result.forEach((p) => {
      const highShare  = p.share >= avgShare;
      const highGrowth = p.growth >= avgGrowth;
      if      ( highShare &&  highGrowth) p.quadrant = "star";
      else if ( highShare && !highGrowth) p.quadrant = "cow";
      else if (!highShare &&  highGrowth) p.quadrant = "question";
      else                                p.quadrant = "dog";

      p.xPct = (p.share / maxShare) * 90 + 5;
      p.yPct = ((p.growth - minGrowth) / growthRange) * 85 + 5;
    });

    return result;
  }, [products, sales]);

  const byQuadrant = useMemo(() => {
    const map: Record<BCGQuadrant, BCGProduct[]> = {
      star: [], cow: [], question: [], dog: [],
    };
    bcgProducts.forEach((p) => map[p.quadrant].push(p));
    return map;
  }, [bcgProducts]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* Quadrant filter buttons */}
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.entries(QUADRANT_META) as [BCGQuadrant, typeof QUADRANT_META[BCGQuadrant]][]).map(([q, meta]) => (
          <button
            key={q}
            onClick={() => setActiveQuadrant(activeQuadrant === q ? null : q)}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-left transition-all",
              meta.bg,
              activeQuadrant === q && "ring-2 ring-offset-1 ring-[#00B4A6]"
            )}
            style={{ borderColor: meta.color + "60" }}
          >
            <div className="flex items-center gap-1">
              <span className="font-bold text-base" style={{ color: meta.color }}>{meta.icon}</span>
              <span className={cn("text-xs font-semibold", meta.text)}>{meta.label}</span>
              <span className="ml-auto text-sm font-bold text-gray-700 dark:text-gray-200">
                {byQuadrant[q].length}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Matrix plot */}
      <div className="relative rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
        {/* Axis labels */}
        <div className="absolute top-1 right-2 text-[9px] text-gray-400 dark:text-gray-500 z-10">
          Crecimiento (%)
        </div>
        <div className="absolute bottom-1 right-2 text-[9px] text-gray-400 dark:text-gray-500 z-10">
          Participacion →
        </div>

        {/* Quadrant backgrounds */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          <div className="bg-emerald-50/30 dark:bg-emerald-900/10 border-r border-b border-dashed border-gray-300 dark:border-gray-600" />
          <div className="bg-green-50/30 dark:bg-green-900/10 border-b border-dashed border-gray-300 dark:border-gray-600" />
          <div className="bg-red-50/30 dark:bg-red-900/10 border-r border-dashed border-gray-300 dark:border-gray-600" />
          <div className="bg-amber-50/30 dark:bg-amber-900/10" />
        </div>

        {/* Quadrant labels in corners */}
        <div className="absolute top-1 left-2 text-[9px] text-emerald-400 dark:text-emerald-500 font-medium">
          Interrogantes
        </div>
        <div className="absolute top-1 right-8 text-[9px] text-green-600 dark:text-green-400 font-medium">
          Estrellas
        </div>
        <div className="absolute bottom-4 left-2 text-[9px] text-red-400 dark:text-red-500 font-medium">
          Perros
        </div>
        <div className="absolute bottom-4 right-8 text-[9px] text-amber-500 dark:text-amber-400 font-medium">
          Vacas
        </div>

        {/* Bubbles */}
        <div className="relative h-72">
          {bcgProducts.map((p) => (
            <BubblePoint key={p.id} product={p} />
          ))}
          {bcgProducts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
              Sin datos de ventas para trazar la matriz
            </div>
          )}
        </div>
      </div>

      {/* Product list by quadrant */}
      {activeQuadrant && (
        <div>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            {QUADRANT_META[activeQuadrant].label} — {QUADRANT_META[activeQuadrant].recommendation}
          </p>
          <div className="flex flex-col gap-1 max-h-64 overflow-auto">
            {byQuadrant[activeQuadrant].map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2 py-1 rounded bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-xs"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: QUADRANT_META[activeQuadrant].color }}
                />
                <span className="flex-1 truncate text-gray-800 dark:text-foreground">{p.name}</span>
                <span className="text-gray-500 dark:text-gray-400">{p.share.toFixed(1)}%</span>
                <span
                  className={cn(
                    "font-medium",
                    p.growth >= 0 ? "text-[#00B4A6] dark:text-[#2dd4bf]" : "text-red-600 dark:text-red-400"
                  )}
                >
                  {fmtPct(p.growth)}
                </span>
              </div>
            ))}
            {byQuadrant[activeQuadrant].length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                Ningun producto en este cuadrante
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
