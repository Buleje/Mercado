"use client";

import { memo, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  CHART_GRID_STROKE,
  CHART_AXIS_COLOR,
  CHART_FONT,
  CHART_PALETTE,
} from "./palette";
import { ChartTooltip } from "./ChartTooltip";
import { cn } from "@/lib/utils";

/**
 * BulejeComparisonOverlay — chart que superpone periodo actual vs anterior.
 *
 * Uso: comparar este mes vs mes pasado, esta semana vs semana pasada.
 * El periodo anterior va como área gris tenue atrás, el actual como línea sólida.
 *
 * @example
 * <BulejeComparisonOverlay
 *   data={[
 *     { day: "L", current: 480, previous: 420 },
 *     { day: "M", current: 520, previous: 380 },
 *     ...
 *   ]}
 *   xKey="day"
 *   currentKey="current"
 *   previousKey="previous"
 *   currentLabel="Esta semana"
 *   previousLabel="Semana pasada"
 *   yAxisFormat={(v) => `S/${v}`}
 * />
 */

interface Props {
  data: Array<Record<string, string | number>>;
  xKey: string;
  currentKey: string;
  previousKey: string;
  currentLabel?: string;
  previousLabel?: string;
  height?: number;
  yAxisFormat?: (value: number) => string;
  tooltipFormat?: (value: number | string, name?: string) => string;
  className?: string;
}

export const BulejeComparisonOverlay = memo(function BulejeComparisonOverlay({
  data,
  xKey,
  currentKey,
  previousKey,
  currentLabel = "Actual",
  previousLabel = "Anterior",
  height = 260,
  yAxisFormat,
  tooltipFormat,
  className,
}: Props) {
  // Calcular delta total para mostrar en label
  const { currentTotal, previousTotal, deltaPercent } = useMemo(() => {
    const cur = data.reduce((s, d) => s + Number(d[currentKey] ?? 0), 0);
    const prev = data.reduce((s, d) => s + Number(d[previousKey] ?? 0), 0);
    const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
    return { currentTotal: cur, previousTotal: prev, deltaPercent: delta };
  }, [data, currentKey, previousKey]);

  const deltaUp = deltaPercent > 0;

  return (
    <div className={className}>
      {/* Header con totales + delta */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {currentLabel}
            </p>
            <p className="text-2xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
              {yAxisFormat ? yAxisFormat(currentTotal) : currentTotal.toLocaleString("es-PE")}
            </p>
          </div>
          <div className="text-[var(--text-tertiary)]">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]">
              {previousLabel}
            </p>
            <p className="text-lg font-bold tabular-nums">
              {yAxisFormat ? yAxisFormat(previousTotal) : previousTotal.toLocaleString("es-PE")}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
            deltaUp
              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
              : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400",
          )}
        >
          {deltaUp ? "↑" : "↓"} {Math.abs(deltaPercent).toFixed(1)}%
        </span>
      </div>

      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="current-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_PALETTE.primary} stopOpacity={0.2} />
              <stop offset="100%" stopColor={CHART_PALETTE.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke={CHART_GRID_STROKE}
            strokeDasharray="0"
            vertical={false}
          />
          <XAxis
            dataKey={xKey}
            stroke={CHART_AXIS_COLOR}
            fontSize={CHART_FONT.axisSize}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_AXIS_COLOR }}
          />
          <YAxis
            stroke={CHART_AXIS_COLOR}
            fontSize={CHART_FONT.axisSize}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_AXIS_COLOR }}
            tickFormatter={yAxisFormat}
          />
          <Tooltip
            content={<ChartTooltip format={tooltipFormat} />}
            cursor={{ stroke: CHART_GRID_STROKE }}
          />
          {/* Previous — area gris atrás */}
          <Area
            type="monotone"
            dataKey={previousKey}
            name={previousLabel}
            stroke={CHART_PALETTE.tertiary}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            fill="none"
            isAnimationActive={true}
            animationDuration={600}
          />
          {/* Current — area con gradient */}
          <Area
            type="monotone"
            dataKey={currentKey}
            name={currentLabel}
            stroke={CHART_PALETTE.primary}
            strokeWidth={2}
            fill="url(#current-gradient)"
            isAnimationActive={true}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
