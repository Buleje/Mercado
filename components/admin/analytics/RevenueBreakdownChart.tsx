"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Product, Sale, SaleItem } from "@/types/erp";

// ── Types ──────────────────────────────────────────────────────────────────────
type ViewMode = "categoria" | "pago" | "hora";

interface RevenueBreakdownChartProps {
  sales: Sale[];
  products: Product[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: number, total: number) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

const CATEGORY_COLORS = [
  "#00B4A6", "#f97316", "#3b82f6", "#8b5cf6",
  "#ec4899", "#2dd4bf", "#f59e0b", "#6366f1",
  "#10b981", "#ef4444",
];

const PAYMENT_COLORS: Record<string, string> = {
  efectivo: "#00B4A6",
  yape: "#3b82f6",
  plin: "#8b5cf6",
  tarjeta: "#f97316",
  transferencia: "#2dd4bf",
};

const HOUR_LABELS = Array.from({ length: 17 }, (_, i) => `${i + 6}h`);

// ── Sub-charts ─────────────────────────────────────────────────────────────────
function HorizontalBar({
  label,
  value,
  total,
  color,
  badge,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  badge?: string;
}) {
  const p = pct(value, total);
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-28 text-xs text-gray-600 dark:text-gray-300 truncate shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-[var(--dur-slow)]"
          style={{ width: `${p}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-16 text-right text-xs text-gray-500 dark:text-gray-400 shrink-0">
        {badge ?? `${p}%`}
      </span>
    </div>
  );
}

function _DonutChart({
  slices,
}: {
  slices: { label: string; value: number; color: string; pct: number }[];
}) {
  // Build conic-gradient string using reduce to avoid mutation
  const { parts: gradientParts } = slices.reduce<{ parts: string[]; acc: number }>(
    ({ parts, acc }, s) => ({
      parts: [...parts, `${s.color} ${acc}% ${acc + s.pct}%`],
      acc: acc + s.pct,
    }),
    { parts: [], acc: 0 }
  );
  const gradient = `conic-gradient(${gradientParts.join(", ")})`;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="w-32 h-32 rounded-full"
        style={{ background: gradient }}
        role="img"
        aria-label="Grafico donut de metodos de pago"
      >
        <div className="w-full h-full rounded-full flex items-center justify-center"
          style={{ background: "radial-gradient(circle at center, var(--bg) 55%, transparent 55%)" }}>
          <span className="sr-only">Donut</span>
        </div>
      </div>
      {/* Inset white circle for donut effect */}
      <div className="flex flex-wrap gap-2 justify-center">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-1 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-gray-600 dark:text-gray-300">{s.label}</span>
            <span className="text-gray-500 dark:text-gray-400">({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function RevenueBreakdownChart({ sales, products }: RevenueBreakdownChartProps) {
  const [view, setView] = useState<ViewMode>("categoria");

  // Build product-to-category map
  const productCatMap = useMemo(() => {
    const map: Record<string, string> = {};
    products.forEach((p) => {
      map[String(p.id)] = p.category ?? "Sin categoría";
    });
    return map;
  }, [products]);

  const totalRevenue = useMemo(() => sales.reduce((s, x) => s + (x.total ?? 0), 0), [sales]);

  // By category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach((sale) => {
      (sale.items ?? []).forEach((item: SaleItem) => {
        const cat = productCatMap[String(item.productId)] ?? item.category ?? "Sin categoría";
        map[cat] = (map[cat] ?? 0) + (item.price ?? 0) * (item.quantity ?? 1);
      });
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [sales, productCatMap]);

  // By payment method
  const byPayment = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach((sale) => {
      const method = sale.payment ?? "efectivo";
      map[method] = (map[method] ?? 0) + (sale.total ?? 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [sales]);

  // By hour (6am-10pm)
  const byHour = useMemo(() => {
    const hours = Array(17).fill(0) as number[];
    sales.forEach((sale) => {
      const h = new Date(sale.createdAt).getHours();
      const idx = h - 6;
      if (idx >= 0 && idx < 17) hours[idx] += sale.total ?? 0;
    });
    return hours;
  }, [sales]);

  const maxHour = Math.max(...byHour, 1);

  const paymentSlices = byPayment.map(([ method, value]) => ({
    label: PAYMENT_LABELS[method] ?? method,
    value,
    color: PAYMENT_COLORS[method] ?? "#6b7280",
    pct: pct(value, totalRevenue),
  }));

  const VIEW_LABELS: Record<ViewMode, string> = {
    categoria: "Por categoria",
    pago: "Por metodo de pago",
    hora: "Por hora del dia",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        {(Object.keys(VIEW_LABELS) as ViewMode[]).map((key) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cn(
              "flex-1 text-xs py-1 rounded-md font-medium transition-colors",
              view === key
                ? "bg-white dark:bg-gray-600 text-[#00B4A6] dark:text-[#2dd4bf] "
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            )}
          >
            {VIEW_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Total */}
      <div className="text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">Total del periodo</p>
        <p className="text-lg font-bold text-[#00B4A6] dark:text-[#2dd4bf]">{fmt(totalRevenue)}</p>
      </div>

      {/* Category view */}
      {view === "categoria" && (
        <div>
          {byCategory.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Sin datos en este periodo</p>
          )}
          {byCategory.map(([cat, value], i) => (
            <HorizontalBar
              key={cat}
              label={cat}
              value={value}
              total={totalRevenue}
              color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
            />
          ))}
        </div>
      )}

      {/* Payment view */}
      {view === "pago" && (
        <div>
          {paymentSlices.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Sin datos en este periodo</p>
          ) : (
            <>
              {/* Donut wrapper: uses an outer div as the "ring" */}
              <div className="flex justify-center mb-3">
                <div className="relative w-52 h-52">
                  <div
                    className="w-52 h-52 rounded-full"
                    style={{
                      background: `conic-gradient(${paymentSlices.map((s) => {
                        const start = paymentSlices.slice(0, paymentSlices.indexOf(s)).reduce((a, b) => a + b.pct, 0);
                        return `${s.color} ${start}% ${start + s.pct}%`;
                      }).join(", ")})`,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-28 h-28 rounded-full bg-white dark:bg-card" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                {paymentSlices.map((s) => (
                  <div key={s.label} className="flex items-center gap-1 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-gray-600 dark:text-gray-300">{s.label}</span>
                    <span className="text-gray-500 dark:text-gray-400">({s.pct}%)</span>
                  </div>
                ))}
              </div>
              {byPayment.map(([method, value]) => (
                <HorizontalBar
                  key={method}
                  label={PAYMENT_LABELS[method] ?? method}
                  value={value}
                  total={totalRevenue}
                  color={PAYMENT_COLORS[method] ?? "#6b7280"}
                  badge={fmt(value)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Hour view */}
      {view === "hora" && (
        <div>
          <div className="flex items-end gap-1.5 h-56">
            {byHour.map((val, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-0.5"
                title={`${HOUR_LABELS[i]}: ${fmt(val)}`}
              >
                <div
                  className="w-full rounded-t transition-all duration-[var(--dur-slow)]"
                  style={{
                    height: `${(val / maxHour) * 100}%`,
                    minHeight: val > 0 ? "2px" : "0px",
                    backgroundColor: "#00B4A6",
                    opacity: val > 0 ? 1 : 0.15,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            {HOUR_LABELS.map((h, i) => (
              <div key={i} className="flex-1 text-center text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 leading-none">
                {i % 2 === 0 ? h : ""}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
            Hora pico:{" "}
            <span className="font-medium text-[#00B4A6] dark:text-[#2dd4bf]">
              {HOUR_LABELS[byHour.indexOf(Math.max(...byHour))]}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
