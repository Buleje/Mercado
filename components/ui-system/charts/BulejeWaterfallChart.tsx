"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { CHART_PALETTE } from "./palette";

/**
 * BulejeWaterfallChart — flujo positive/negative con acumulado.
 *
 * Patron clasico de reportes financieros: ingresos -> gastos -> utilidad.
 * Render en SVG nativo, sin librerias.
 *
 * @example
 * <BulejeWaterfallChart
 *   steps={[
 *     { label: "Inicio", value: 0, type: "baseline" },
 *     { label: "Ventas", value: 12000, type: "positive" },
 *     { label: "Insumos", value: -4500, type: "negative" },
 *     { label: "Sueldos", value: -2800, type: "negative" },
 *     { label: "Utilidad", value: 4700, type: "total" },
 *   ]}
 *   currency="S/"
 * />
 */

export interface WaterfallStep {
  label: string;
  value: number;
  type: "baseline" | "positive" | "negative" | "total";
}

interface BulejeWaterfallChartProps {
  steps: WaterfallStep[];
  label?: string;
  sublabel?: string;
  currency?: string;
  height?: number;
  className?: string;
}

export const BulejeWaterfallChart = memo(function BulejeWaterfallChart({
  steps,
  label,
  sublabel,
  currency = "S/",
  height = 260,
  className,
}: BulejeWaterfallChartProps) {
  // Compute cumulative values for each step
  let cumulative = 0;
  const bars = steps.map((step) => {
    if (step.type === "baseline") {
      cumulative = step.value;
      return { ...step, start: 0, end: step.value, cumulative };
    }
    if (step.type === "total") {
      return { ...step, start: 0, end: step.value, cumulative: step.value };
    }
    const start = cumulative;
    cumulative += step.value;
    return { ...step, start, end: cumulative, cumulative };
  });

  const allValues = bars.flatMap((b) => [b.start, b.end]);
  const maxVal = Math.max(...allValues);
  const minVal = Math.min(0, Math.min(...allValues));
  const range = maxVal - minVal || 1;

  const chartH = height - 40; // reserve 40px for labels below
  const barWidth = Math.min(56, 100 / bars.length);

  const colorFor = (type: WaterfallStep["type"]) => {
    switch (type) {
      case "positive":
        return CHART_PALETTE.accent;
      case "negative":
        return CHART_PALETTE.error;
      case "baseline":
      case "total":
      default:
        return CHART_PALETTE.primary;
    }
  };

  const fmt = (v: number) =>
    `${currency}${Math.abs(v).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5", className)}>
      {(label || sublabel) && (
        <div className="mb-5">
          {label && (
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">
              {label}
            </p>
          )}
          {sublabel && (
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              {sublabel}
            </h3>
          )}
        </div>
      )}

      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${bars.length * (barWidth + 2) + 20} ${height}`}
          preserveAspectRatio="xMidYMax meet"
          className="w-full h-full"
          aria-hidden
        >
          {/* Zero line */}
          <line
            x1={0}
            y1={chartH - ((0 - minVal) / range) * chartH}
            x2={bars.length * (barWidth + 2) + 20}
            y2={chartH - ((0 - minVal) / range) * chartH}
            stroke="var(--rule-base, #e5e5e5)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          {bars.map((b, i) => {
            const x = i * (barWidth + 2) + 10;
            const y1 = chartH - ((Math.max(b.start, b.end) - minVal) / range) * chartH;
            const y2 = chartH - ((Math.min(b.start, b.end) - minVal) / range) * chartH;
            const h = Math.abs(y2 - y1);
            return (
              <g key={`${b.label}-${i}`}>
                <rect
                  x={x}
                  y={y1}
                  width={barWidth}
                  height={h}
                  rx={2}
                  fill={colorFor(b.type)}
                  style={{
                    transition: "all 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDelay: `${i * 0.08}s`,
                  }}
                />
                {/* Connector line from prev bar to this bar (except first) */}
                {i > 0 && b.type !== "total" && (
                  <line
                    x1={(i - 1) * (barWidth + 2) + 10 + barWidth}
                    y1={chartH - ((bars[i - 1].end - minVal) / range) * chartH}
                    x2={x}
                    y2={chartH - ((b.start - minVal) / range) * chartH}
                    stroke="var(--rule-base, #e5e5e5)"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                )}
                {/* Value label on top */}
                <text
                  x={x + barWidth / 2}
                  y={y1 - 6}
                  textAnchor="middle"
                  className="fill-[var(--text-primary)]"
                  style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                >
                  {fmt(b.value)}
                </text>
                {/* Bottom label */}
                <text
                  x={x + barWidth / 2}
                  y={chartH + 20}
                  textAnchor="middle"
                  className="fill-[var(--text-tertiary)]"
                  style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}
                >
                  {b.label.length > 9 ? b.label.slice(0, 9) + "…" : b.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});
