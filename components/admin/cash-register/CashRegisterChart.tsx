"use client";

import { AreaChart, Area, ReferenceLine, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface SparkPoint {
  idx: number;
  diff: number;
  pos: number;
  neg: number;
}

interface Tendencia {
  label: string;
  color: string;
}

interface CashRegisterChartProps {
  sparkData: SparkPoint[];
  diffsCount: number;
  tendencia: Tendencia | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CashRegisterChart({
  sparkData,
  diffsCount,
  tendencia,
}: CashRegisterChartProps) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted">
          Tendencia de diferencias (ultimos {diffsCount} cierres)
        </p>
        {tendencia && (
          <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", tendencia.color)}>
            {tendencia.label === "Mejorando"
              ? "Mejorando ↓"
              : tendencia.label === "Empeorando"
              ? "Empeorando ↑"
              : tendencia.label === "Estable"
              ? "→ Estable"
              : tendencia.label}
          </span>
        )}
      </div>
      <ResponsiveContainer minWidth={0} width="100%" height={60}>
        <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id="sparkPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00B4A6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#00B4A6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="sparkNeg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="pos"
            stroke="#00B4A6"
            fill="url(#sparkPos)"
            strokeWidth={1.5}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="neg"
            stroke="#ef4444"
            fill="url(#sparkNeg)"
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <span>Antiguo</span>
        <span>Reciente</span>
      </div>
    </div>
  );
}
