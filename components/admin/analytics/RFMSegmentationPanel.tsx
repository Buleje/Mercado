"use client";

import { useState, useMemo } from "react";
import {
  Crown, Heart, AlertTriangle, XCircle, Sparkles, User,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Customer, Sale } from "@/types/erp";

// ── Types ──────────────────────────────────────────────────────────────────────
type RFMSegment = "Champions" | "Loyal" | "At Risk" | "Lost" | "New" | "Regular";

interface EnrichedCustomer {
  phone: string;
  name: string;
  R: number;
  F: number;
  M: number;
  segment: RFMSegment;
  totalSpent: number;
  lastOrderDate: string | null;
  orderCount: number;
}

interface RFMSegmentationPanelProps {
  customers: Customer[];
  sales: Sale[];
}

// ── Segment Config ─────────────────────────────────────────────────────────────
const SEGMENT_STYLE: Record<RFMSegment, { bg: string; text: string; border: string; icon: typeof Crown; color: string }> = {
  Champions:  { bg: "bg-primary/10 dark:bg-primary/15", text: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", icon: Crown, color: "var(--accent)" },
  Loyal:      { bg: "bg-primary/10 dark:bg-primary/15",   text: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",   border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", icon: Heart, color: "#2563eb" },
  "At Risk":  { bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", text: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", border: "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]", icon: AlertTriangle, color: "#f0503f" },
  Lost:       { bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",     text: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",     border: "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]", icon: XCircle, color: "#dc2626" },
  New:        { bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", border: "border-[var(--rule-base)]0 dark:border-[var(--rule-base)]", icon: Sparkles, color: "#7c3aed" },
  Regular:    { bg: "bg-[var(--surface-sunken)]/50",   text: "text-[var(--text-secondary)]",   border: "border-gray-400 dark:border-gray-500", icon: User, color: "#6b7280" },
};

const ALL_SEGMENTS: RFMSegment[] = ["Champions", "Loyal", "At Risk", "Lost", "New", "Regular"];

// ── RFM Classification ─────────────────────────────────────────────────────────
function classifyRFM(R: number, F: number, M: number): RFMSegment {
  if (R <= 30 && F >= 5 && M >= 500) return "Champions";
  if (F === 1) return "New";
  if (R > 90) return "Lost";
  if (R > 60) return "At Risk";
  if (F >= 3) return "Loyal";
  return "Regular";
}

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function rfmScore(R: number, F: number, M: number): string {
  const rs = R <= 7 ? 5 : R <= 14 ? 4 : R <= 30 ? 3 : R <= 60 ? 2 : 1;
  const fs = F >= 10 ? 5 : F >= 5 ? 4 : F >= 3 ? 3 : F >= 2 ? 2 : 1;
  const ms = M >= 2000 ? 5 : M >= 1000 ? 4 : M >= 500 ? 3 : M >= 100 ? 2 : 1;
  return `${rs}-${fs}-${ms}`;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function RFMSegmentationPanel({ customers, sales }: RFMSegmentationPanelProps) {
  const [filterSegment, setFilterSegment] = useState<RFMSegment | "Todos">("Todos");
  const [sortKey, setSortKey] = useState<"M" | "F" | "R" | "name">("M");

  // Build per-customer stats from sales
  const enriched = useMemo<EnrichedCustomer[]>(() => {
    const now = new Date();
    const statsMap: Record<string, { totalSpent: number; orderCount: number; lastDate: Date | null }> = {};

    sales.forEach((sale) => {
      const phone = sale.customerPhone ?? "sin-teléfono";
      if (!statsMap[phone]) statsMap[phone] = { totalSpent: 0, orderCount: 0, lastDate: null };
      statsMap[phone].totalSpent += sale.total ?? 0;
      statsMap[phone].orderCount += 1;
      const d = new Date(sale.createdAt);
      if (!statsMap[phone].lastDate || d > statsMap[phone].lastDate!) {
        statsMap[phone].lastDate = d;
      }
    });

    return customers
      .filter((c) => c.phone)
      .map((c) => {
        const phone = String(c.phone ?? "");
        const stats = statsMap[phone] ?? { totalSpent: c.totalSpent ?? 0, orderCount: c.orderCount ?? 0, lastDate: null };
        const lastDate = stats.lastDate ?? (c.lastOrderDate ? new Date(c.lastOrderDate) : null);
        const R = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / 86_400_000) : 999;
        const F = stats.orderCount;
        const M = stats.totalSpent;
        return {
          phone,
          name: c.name,
          R,
          F,
          M,
          segment: classifyRFM(R, F, M),
          totalSpent: M,
          lastOrderDate: lastDate ? lastDate.toISOString() : null,
          orderCount: F,
        };
      });
  }, [customers, sales]);

  // Segment counts
  const segmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const revenue: Record<string, number> = {};
    const totalRevenue = enriched.reduce((s, c) => s + c.M, 0);
    ALL_SEGMENTS.forEach((seg) => {
      counts[seg] = 0;
      revenue[seg] = 0;
    });
    enriched.forEach((c) => {
      counts[c.segment] = (counts[c.segment] ?? 0) + 1;
      revenue[c.segment] = (revenue[c.segment] ?? 0) + c.M;
    });
    return { counts, revenue, totalRevenue };
  }, [enriched]);

  // Filtered + sorted
  const visible = useMemo(() => {
    let list = enriched;
    if (filterSegment !== "Todos") list = list.filter((c) => c.segment === filterSegment);
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      return b[sortKey] - a[sortKey];
    });
  }, [enriched, filterSegment, sortKey]);

  const segStyle = (seg: RFMSegment) => SEGMENT_STYLE[seg];

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Segment summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {ALL_SEGMENTS.map((seg) => {
          const style = segStyle(seg);
          const SegIcon = style.icon;
          const pctRevenue =
            segmentCounts.totalRevenue > 0
              ? Math.round((segmentCounts.revenue[seg] / segmentCounts.totalRevenue) * 100)
              : 0;
          return (
            <button
              key={seg}
              onClick={() => setFilterSegment(filterSegment === seg ? "Todos" : seg)}
              className={cn(
                "rounded-xl border-2 p-3 text-left transition-all hover:shadow-sm",
                style.bg,
                style.border,
                filterSegment === seg && "ring-2 ring-offset-1 ring-primary dark:ring-offset-gray-900"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <SegIcon className={cn("h-4 w-4 shrink-0", style.text)} />
                <p className={cn("text-xs font-bold leading-tight truncate", style.text)}>{seg}</p>
              </div>
              <p className="text-2xl font-mono font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {segmentCounts.counts[seg]}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{pctRevenue}% revenue</p>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">
          {visible.length} cliente{visible.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-[var(--text-tertiary)]">Ordenar:</span>
          {(["M", "F", "R", "name"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={cn(
                "px-2 py-0.5 rounded text-xs border transition-colors",
                sortKey === k
                  ? "bg-primary text-white border-primary"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)]"
              )}
            >
              {k === "M" ? "Valor" : k === "F" ? "Frecuencia" : k === "R" ? "Recencia" : "Nombre"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-80 rounded-xl border border-[var(--rule-base)] ">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
              <th className="text-left px-3 py-2 font-semibold text-[var(--text-secondary)]">Cliente</th>
              <th className="text-center px-2 py-2 font-semibold text-[var(--text-secondary)]">Segmento</th>
              <th className="text-right px-2 py-2 font-semibold text-[var(--text-secondary)]">Score</th>
              <th className="text-right px-2 py-2 font-semibold text-[var(--text-secondary)]">R(dias)</th>
              <th className="text-right px-2 py-2 font-semibold text-[var(--text-secondary)]">F(ped)</th>
              <th className="text-right px-2 py-2 font-semibold text-[var(--text-secondary)]">M(total)</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-[var(--text-tertiary)]">
                  Sin clientes con datos de compra
                </td>
              </tr>
            )}
            {visible.slice(0, 100).map((c, idx) => {
              const style = segStyle(c.segment);
              return (
                <tr
                  key={c.phone}
                  className={cn(
                    "border-b border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]/50 transition-colors",
                    idx % 2 === 1 && "bg-gray-50/50 dark:bg-gray-800/20"
                  )}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate max-w-[100px]">{c.name}</p>
                    <p className="text-[var(--text-tertiary)]">{c.phone}</p>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold border",
                        style.bg, style.text, style.border
                      )}
                    >
                      {(() => { const SegIcon = style.icon; return <SegIcon className="h-3 w-3 shrink-0" />; })()}
                      {c.segment}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[var(--text-secondary)]">
                    {rfmScore(c.R, c.F, c.M)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[var(--text-secondary)]">
                    {c.R === 999 ? "--" : c.R}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[var(--text-secondary)]">{c.F}</td>
                  <td className="px-2 py-2 text-right font-mono font-medium text-primary dark:text-primary">
                    {fmt(c.M)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length > 100 && (
          <p className="text-center text-xs text-[var(--text-tertiary)] py-2">
            Mostrando 100 de {visible.length} clientes
          </p>
        )}
      </div>
    </div>
  );
}
