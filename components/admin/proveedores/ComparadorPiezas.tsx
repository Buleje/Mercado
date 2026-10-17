"use client";

import { cn } from "@/lib/utils";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import type { SupplierWithScore } from "./comparador-datos";

export function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export function ScoreBadge({ score, hasData = true }: { score: number; hasData?: boolean }) {
  // Sin datos reales → badge neutro "—" (no una letra que implique evaluación).
  if (!hasData) {
    return (
      <span
        title="Sin historial suficiente para evaluar"
        className="inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-extrabold bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
      >
        —
      </span>
    );
  }
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  const colors: Record<string, string> = {
    A: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
    B: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
    C: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",
    D: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]",
  };
  return (
    <span className={cn("inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-extrabold", colors[grade])}>
      {grade}
    </span>
  );
}

// ── Radar Chart for single supplier ──────────────────────────────────────────

export function SupplierRadar({ supplier }: { supplier: SupplierWithScore }) {
  const data = [
    { axis: "Precio",   value: Math.round(supplier.scorePrecio) },
    { axis: "Calidad",  value: Math.round(supplier.scoreCalidad) },
    { axis: "Tiempo",   value: Math.round(supplier.scoreTiempo) },
    { axis: "Variedad", value: Math.round(supplier.scoreVariedad) },
    { axis: "Pago",     value: Math.round(supplier.scoreCondicion) },
  ];
  return (
    <div className="h-48">
      <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} minWidth={0} width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--rule-base)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
            tickCount={3}
          />
          <Radar dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.2} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--rule-base)",
              borderRadius: "0.5rem",
              fontSize: 12,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
