"use client";

import { memo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  ReferenceLine,
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
 * BulejeMultiSeriesLine — line chart con hasta 5 series comparativas.
 *
 * Patron tipico: este periodo vs anterior vs promedio vs meta vs forecast.
 * La serie "target" (meta) se renderiza como línea punteada.
 *
 * @example
 * <BulejeMultiSeriesLine
 *   data={last30Days}
 *   xKey="day"
 *   series={[
 *     { key: "thisMonth", label: "Este mes", color: "primary", strokeWidth: 2 },
 *     { key: "lastMonth", label: "Mes pasado", color: "tertiary", strokeDasharray: "3 4" },
 *     { key: "avg3mo", label: "Promedio 3m", color: "secondary", opacity: 0.7 },
 *   ]}
 *   targetValue={5000}
 *   targetLabel="Meta S/5k"
 *   yAxisFormat={(v) => `S/${(v / 1000).toFixed(1)}k`}
 * />
 */

type ColorKey = "primary" | "secondary" | "tertiary" | "quaternary" | "accent" | "info" | "amber" | "purple";

interface SeriesConfig {
  key: string;
  label: string;
  color?: ColorKey;
  strokeWidth?: number;
  /** Linea punteada — ej. "3 4" */
  strokeDasharray?: string;
  opacity?: number;
  /** Si true, muestra dots en puntos últimos */
  showDots?: boolean;
}

interface Props {
  data: Array<Record<string, string | number>>;
  xKey: string;
  /** Max 5 series */
  series: SeriesConfig[];
  /** Valor constante de meta (dibuja reference line punteada) */
  targetValue?: number;
  targetLabel?: string;
  height?: number;
  yAxisFormat?: (value: number) => string;
  tooltipFormat?: (value: number | string, name?: string) => string;
  showLegend?: boolean;
  className?: string;
}

function resolveColor(key?: ColorKey): string {
  if (!key) return CHART_PALETTE.primary;
  return CHART_PALETTE[key] ?? CHART_PALETTE.primary;
}

export const BulejeMultiSeriesLine = memo(function BulejeMultiSeriesLine({
  data,
  xKey,
  series,
  targetValue,
  targetLabel,
  height = 280,
  yAxisFormat,
  tooltipFormat,
  showLegend = true,
  className,
}: Props) {
  if (series.length > 5) {
    console.warn("[BulejeMultiSeriesLine] Más de 5 series puede saturar. Considerá dividir.");
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
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
          {showLegend && (
            <Legend
              wrapperStyle={{
                paddingTop: 12,
                fontSize: CHART_FONT.labelSize,
                fontFamily: CHART_FONT.family,
              }}
              iconType="plainline"
            />
          )}
          {/* Target line */}
          {targetValue != null && (
            <ReferenceLine
              y={targetValue}
              stroke={CHART_PALETTE.accent}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: targetLabel ?? `Meta ${targetValue}`,
                position: "insideTopRight",
                fill: CHART_PALETTE.accent,
                fontSize: CHART_FONT.axisSize,
                fontWeight: 700,
              }}
            />
          )}
          {series.slice(0, 5).map((s, idx) => {
            const color = resolveColor(s.color);
            return (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={s.strokeWidth ?? 1.75}
                strokeDasharray={s.strokeDasharray}
                strokeOpacity={s.opacity ?? 1}
                dot={s.showDots ? { r: 3, fill: color } : false}
                activeDot={{ r: 4, fill: color }}
                isAnimationActive={true}
                animationDuration={600 + idx * 100}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});
