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
  alto:  { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",  text: "text-[var(--data-success)] dark:text-[var(--data-success)]",  border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30",  label: "Alto valor" },
  medio: { bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/30",  text: "text-[var(--data-warning)] dark:text-[var(--data-warning)]",  border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]",  label: "Valor medio" },
  bajo:  { bg: "bg-[var(--surface-sunken)]/50",    text: "text-[var(--text-secondary)]",    border: "border-[var(--rule-base)] dark:border-gray-600",    label: "Bajo valor" },
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
        <div className="rounded-lg bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 border border-[#00B4A6]/30 p-2 text-center">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">CLV promedio</p>
          <p className="text-base font-bold text-[#00B4A6] dark:text-[#2dd4bf]">{fmt(avgCLV)}</p>
        </div>
        <div className="rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] p-2 text-center">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Clientes con datos</p>
          <p className="text-base font-bold text-[var(--text-primary)] dark:text-foreground">{clvList.length}</p>
        </div>
      </div>

      {/* Tier filter buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setFilterTier("todos")}
          className={cn(
            "flex-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors",
            filterTier === "todos"
              ? "bg-gray-800 dark:bg-gray-200 text-white dark:text-[var(--text-primary)] border-gray-800 dark:border-gray-200"
              : "text-[var(--text-secondary)] border-[var(--rule-base)]"
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
                  ? cn(style.bg, style.text, style.border, "ring-2 ring-offset-1 ring-[#00B4A6]")
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
        <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">Distribucion de CLV</p>
        <div className="flex items-end gap-1 h-16">
          {histogram.map((bucket) => (
            <div
              key={bucket.label}
              className="flex-1 flex flex-col items-center gap-0.5"
              title={`${bucket.label}: ${bucket.count} clientes`}
            >
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{bucket.count}</span>
              <div
                className="w-full rounded-t-sm transition-all duration-[var(--dur-slow)]"
                style={{
                  height: `${(bucket.count / maxHistCount) * 100}%`,
                  minHeight: bucket.count > 0 ? "2px" : "0px",
                  backgroundColor: "#00B4A6",
                  opacity: bucket.count > 0 ? 0.85 : 0.15,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-0.5">
          {histogram.map((bucket) => (
            <div key={bucket.label} className="flex-1 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-none">
              {bucket.label}
            </div>
          ))}
        </div>
      </div>

      {/* Top 20 table */}
      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)] mb-1">
          Top {Math.min(20, visible.length)} clientes por CLV
        </p>
        <div className="overflow-auto max-h-48 rounded-lg border border-[var(--rule-base)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <th className="text-left px-2 py-1.5 font-semibold text-[var(--text-secondary)]">#</th>
                <th className="text-left px-2 py-1.5 font-semibold text-[var(--text-secondary)]">Cliente</th>
                <th className="text-center px-2 py-1.5 font-semibold text-[var(--text-secondary)]">Tier</th>
                <th className="text-right px-2 py-1.5 font-semibold text-[var(--text-secondary)]">Ticket prom.</th>
                <th className="text-right px-2 py-1.5 font-semibold text-[var(--text-secondary)]">Pedidos</th>
                <th className="text-right px-2 py-1.5 font-semibold text-[var(--text-secondary)]">CLV</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-[var(--text-tertiary)]">
                    Sin clientes con historial de compras
                  </td>
                </tr>
              )}
              {visible.map((c, i) => {
                const style = TIER_STYLE[c.tier];
                return (
                  <tr
                    key={c.phone}
                    className="border-b border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]/50"
                  >
                    <td className="px-2 py-1.5 text-[var(--text-tertiary)]">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <p className="font-medium text-[var(--text-primary)] dark:text-foreground truncate max-w-[90px]">{c.name}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.phone}</p>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={cn("px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-semibold border", style.bg, style.text, style.border)}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-[var(--text-secondary)]">
                      {fmt(c.avgTicket)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[var(--text-secondary)]">
                      {c.orderCount}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold text-[#00B4A6] dark:text-[#2dd4bf]">
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
