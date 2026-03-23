"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Customer, Sale } from "@/types/erp";

// ── Types ──────────────────────────────────────────────────────────────────────
interface CustomerLifetimeValueProps {
  customers: Customer[];
  sales: Sale[];
}

type CLVTier = "alto" | "medio" | "bajo";

interface CLVCustomer {
  phone: string;
  name: string;
  avgTicket: number;
  monthlyFreq: number;
  activeMonths: number;
  clv: number;
  tier: CLVTier;
  totalSpent: number;
  orderCount: number;
}

// ── Config ─────────────────────────────────────────────────────────────────────
const TIER_STYLE: Record<CLVTier, { bg: string; text: string; border: string; label: string }> = {
  alto:  { bg: "bg-green-100 dark:bg-green-900/30",  text: "text-green-800 dark:text-green-300",  border: "border-green-300 dark:border-green-700",  label: "Alto valor" },
  medio: { bg: "bg-amber-100 dark:bg-amber-900/30",  text: "text-amber-800 dark:text-amber-300",  border: "border-amber-300 dark:border-amber-700",  label: "Valor medio" },
  bajo:  { bg: "bg-gray-100 dark:bg-gray-700/50",    text: "text-gray-700 dark:text-gray-300",    border: "border-gray-300 dark:border-gray-600",    label: "Bajo valor" },
};

const HISTOGRAM_BUCKETS = [
  { label: "S/0-100",   min: 0,    max: 100 },
  { label: "S/100-500", min: 100,  max: 500 },
  { label: "S/500-1k",  min: 500,  max: 1000 },
  { label: "S/1k-5k",   min: 1000, max: 5000 },
  { label: "S/5k+",     min: 5000, max: Infinity },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 1_000_000) return `S/${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `S/${(n / 1_000).toFixed(1)}k`;
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CustomerLifetimeValue({ customers, sales }: CustomerLifetimeValueProps) {
  const [filterTier, setFilterTier] = useState<CLVTier | "todos">("todos");

  const { clvList, avgCLV } = useMemo(() => {
    // Aggregate sales per customer
    const statsMap: Record<string, {
      totalSpent: number;
      orderCount: number;
      firstDate: Date;
      lastDate: Date;
    }> = {};

    sales.forEach((sale) => {
      const phone = sale.customerPhone ?? "";
      if (!phone) return;
      const d = new Date(sale.createdAt);
      if (!statsMap[phone]) {
        statsMap[phone] = { totalSpent: 0, orderCount: 0, firstDate: d, lastDate: d };
      }
      statsMap[phone].totalSpent += sale.total ?? 0;
      statsMap[phone].orderCount += 1;
      if (d < statsMap[phone].firstDate) statsMap[phone].firstDate = d;
      if (d > statsMap[phone].lastDate)  statsMap[phone].lastDate  = d;
    });

    const list: CLVCustomer[] = customers
      .filter((c) => c.phone && statsMap[String(c.phone)])
      .map((c) => {
        const phone = String(c.phone ?? "");
        const stats = statsMap[phone];
        const avgTicket = stats.orderCount > 0 ? stats.totalSpent / stats.orderCount : 0;
        const msActive = stats.lastDate.getTime() - stats.firstDate.getTime();
        const activeMonths = Math.max(1, msActive / (30 * 86_400_000));
        const monthlyFreq = stats.orderCount / activeMonths;
        // CLV = avgTicket * monthlyFreq * activeMonths (simple historical CLV)
        const clv = avgTicket * monthlyFreq * activeMonths;

        return {
          phone,
          name: c.name,
          avgTicket,
          monthlyFreq,
          activeMonths,
          clv,
          tier: "bajo" as CLVTier,
          totalSpent: stats.totalSpent,
          orderCount: stats.orderCount,
        };
      })
      .sort((a, b) => b.clv - a.clv);

    // Assign tiers: top 20% = alto, next 40% = medio, bottom 40% = bajo
    const n = list.length;
    const top20 = Math.ceil(n * 0.2);
    const top60 = Math.ceil(n * 0.6);
    list.forEach((c, i) => {
      if (i < top20) c.tier = "alto";
      else if (i < top60) c.tier = "medio";
      else c.tier = "bajo";
    });

    const avgCLV = n > 0 ? list.reduce((s, c) => s + c.clv, 0) / n : 0;

    return { clvList: list, avgCLV };
  }, [customers, sales]);

  // Histogram
  const histogram = useMemo(() => {
    return HISTOGRAM_BUCKETS.map((bucket) => ({
      ...bucket,
      count: clvList.filter((c) => c.clv >= bucket.min && c.clv < bucket.max).length,
    }));
  }, [clvList]);

  const maxHistCount = Math.max(...histogram.map((b) => b.count), 1);

  // Tier counts
  const tierCounts = useMemo(() => ({
    alto:  clvList.filter((c) => c.tier === "alto").length,
    medio: clvList.filter((c) => c.tier === "medio").length,
    bajo:  clvList.filter((c) => c.tier === "bajo").length,
  }), [clvList]);

  const visible = filterTier === "todos"
    ? clvList.slice(0, 20)
    : clvList.filter((c) => c.tier === filterTier).slice(0, 20);

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[#2d6a4f]/10 dark:bg-[#2d6a4f]/20 border border-[#2d6a4f]/30 p-2 text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">CLV promedio</p>
          <p className="text-base font-bold text-[#2d6a4f] dark:text-[#52b788]">{fmt(avgCLV)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 text-center">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Clientes con datos</p>
          <p className="text-base font-bold text-gray-800 dark:text-foreground">{clvList.length}</p>
        </div>
      </div>

      {/* Tier filter buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setFilterTier("todos")}
          className={cn(
            "flex-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors",
            filterTier === "todos"
              ? "bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 border-gray-800 dark:border-gray-200"
              : "text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
          )}
        >
          Todos ({clvList.length})
        </button>
        {(["alto", "medio", "bajo"] as CLVTier[]).map((tier) => {
          const style = TIER_STYLE[tier];
          return (
            <button
              key={tier}
              onClick={() => setFilterTier(filterTier === tier ? "todos" : tier)}
              className={cn(
                "flex-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors",
                filterTier === tier
                  ? cn(style.bg, style.text, style.border, "ring-2 ring-offset-1 ring-[#2d6a4f]")
                  : cn(style.bg, style.text, style.border)
              )}
            >
              {style.label} ({tierCounts[tier]})
            </button>
          );
        })}
      </div>

      {/* CLV Histogram */}
      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Distribucion de CLV</p>
        <div className="flex items-end gap-1 h-16">
          {histogram.map((bucket) => (
            <div
              key={bucket.label}
              className="flex-1 flex flex-col items-center gap-0.5"
              title={`${bucket.label}: ${bucket.count} clientes`}
            >
              <span className="text-[9px] text-gray-500 dark:text-gray-400">{bucket.count}</span>
              <div
                className="w-full rounded-t-sm transition-all duration-500"
                style={{
                  height: `${(bucket.count / maxHistCount) * 100}%`,
                  minHeight: bucket.count > 0 ? "2px" : "0px",
                  backgroundColor: "#2d6a4f",
                  opacity: bucket.count > 0 ? 0.85 : 0.15,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-0.5">
          {histogram.map((bucket) => (
            <div key={bucket.label} className="flex-1 text-center text-[8px] text-gray-400 dark:text-gray-500 leading-none">
              {bucket.label}
            </div>
          ))}
        </div>
      </div>

      {/* Top 20 table */}
      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Top {Math.min(20, visible.length)} clientes por CLV
        </p>
        <div className="overflow-auto max-h-48 rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">#</th>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">Cliente</th>
                <th className="text-center px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">Tier</th>
                <th className="text-right px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">Ticket prom.</th>
                <th className="text-right px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">Pedidos</th>
                <th className="text-right px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300">CLV</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-gray-400 dark:text-gray-500">
                    Sin clientes con historial de compras
                  </td>
                </tr>
              )}
              {visible.map((c, i) => {
                const style = TIER_STYLE[c.tier];
                return (
                  <tr
                    key={c.phone}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-2 py-1.5 text-gray-400 dark:text-gray-500">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <p className="font-medium text-gray-800 dark:text-foreground truncate max-w-[90px]">{c.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{c.phone}</p>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-semibold border", style.bg, style.text, style.border)}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-300">
                      {fmt(c.avgTicket)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-300">
                      {c.orderCount}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#2d6a4f] dark:text-[#52b788]">
                      {fmt(c.clv)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
