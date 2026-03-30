"use client";

import { useState, useMemo } from "react";
import {
  Crown, Heart, AlertTriangle, XCircle, Sparkles, User,
} from "lucide-react";
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
  Champions:  { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-800 dark:text-emerald-300", border: "border-emerald-500 dark:border-emerald-600", icon: Crown, color: "#059669" },
  Loyal:      { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-800 dark:text-blue-300",   border: "border-blue-500 dark:border-blue-600", icon: Heart, color: "#2563eb" },
  "At Risk":  { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", border: "border-orange-500 dark:border-orange-600", icon: AlertTriangle, color: "#ea580c" },
  Lost:       { bg: "bg-red-100 dark:bg-red-900/30",     text: "text-red-800 dark:text-red-300",     border: "border-red-500 dark:border-red-600", icon: XCircle, color: "#dc2626" },
  New:        { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-300", border: "border-purple-500 dark:border-purple-600", icon: Sparkles, color: "#7c3aed" },
  Regular:    { bg: "bg-gray-100 dark:bg-gray-700/50",   text: "text-gray-700 dark:text-gray-300",   border: "border-gray-400 dark:border-gray-500", icon: User, color: "#6b7280" },
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
      const phone = sale.customerPhone ?? "sin-telefono";
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
                "rounded-xl border-2 p-3 text-left transition-all hover:shadow-md",
                style.bg,
                style.border,
                filterSegment === seg && "ring-2 ring-offset-1 ring-[#0f766e] dark:ring-offset-gray-900"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <SegIcon className={cn("h-4 w-4 shrink-0", style.text)} />
                <p className={cn("text-xs font-bold leading-tight truncate", style.text)}>{seg}</p>
              </div>
              <p className="text-2xl font-mono font-extrabold text-gray-800 dark:text-foreground">
                {segmentCounts.counts[seg]}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{pctRevenue}% revenue</p>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {visible.length} cliente{visible.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Ordenar:</span>
          {(["M", "F", "R", "name"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={cn(
                "px-2 py-0.5 rounded text-xs border transition-colors",
                sortKey === k
                  ? "bg-[#0f766e] text-white border-[#0f766e]"
                  : "bg-white dark:bg-card text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
              )}
            >
              {k === "M" ? "Valor" : k === "F" ? "Frecuencia" : k === "R" ? "Recencia" : "Nombre"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-80 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Cliente</th>
              <th className="text-center px-2 py-2 font-semibold text-gray-600 dark:text-gray-300">Segmento</th>
              <th className="text-right px-2 py-2 font-semibold text-gray-600 dark:text-gray-300">Score</th>
              <th className="text-right px-2 py-2 font-semibold text-gray-600 dark:text-gray-300">R(dias)</th>
              <th className="text-right px-2 py-2 font-semibold text-gray-600 dark:text-gray-300">F(ped)</th>
              <th className="text-right px-2 py-2 font-semibold text-gray-600 dark:text-gray-300">M(total)</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-gray-400 dark:text-gray-500">
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
                    "border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                    idx % 2 === 1 && "bg-gray-50/50 dark:bg-gray-800/20"
                  )}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-800 dark:text-foreground truncate max-w-[100px]">{c.name}</p>
                    <p className="text-gray-400 dark:text-gray-500">{c.phone}</p>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                        style.bg, style.text, style.border
                      )}
                    >
                      {(() => { const SegIcon = style.icon; return <SegIcon className="h-3 w-3 shrink-0" />; })()}
                      {c.segment}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-gray-600 dark:text-gray-300">
                    {rfmScore(c.R, c.F, c.M)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-gray-600 dark:text-gray-300">
                    {c.R === 999 ? "--" : c.R}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-gray-600 dark:text-gray-300">{c.F}</td>
                  <td className="px-2 py-2 text-right font-mono font-medium text-[#0f766e] dark:text-[#14b8a6]">
                    {fmt(c.M)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length > 100 && (
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">
            Mostrando 100 de {visible.length} clientes
          </p>
        )}
      </div>
    </div>
  );
}
