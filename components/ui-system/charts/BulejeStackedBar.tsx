"use client";

import { memo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
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
 * BulejeStackedBar — barras apiladas (stacked).
 *
 * Uso tipico: ventas por categoría × día, composicion de ingresos por canal.
 * Reemplaza dona + bar chart separados cuando quieres ver TOTAL + BREAKDOWN.
 *
 * @example
 * <BulejeStackedBar
 *   data={last7Days}
 *   xKey="day"
 *   stacks={[
 *     { key: "abarrotes", label: "Abarrotes", color: "primary" },
 *     { key: "bebidas", label: "Bebidas", color: "secondary" },
 *     { key: "carnes", label: "Carnes", color: "tertiary" },
 *     { key: "limpieza", label: "Limpieza", color: "quaternary" },
 *   ]}
 *   yAxisFormat={(v) => `S/${v}`}
 * />
 */

// Los tres últimos son los colores de ESTADO del sistema (bien / atención /
// problema). No son slots categóricos: se usan sólo cuando el segmento ES un
// estado, y siempre con su etiqueta al lado — nunca como "la cuarta serie".
type ColorKey =
  | "primary" | "secondary" | "tertiary" | "quaternary" | "accent" | "info" | "amber" | "purple"
  | "success" | "warning" | "error";

interface StackConfig {
  key: string;
  label: string;
  color?: ColorKey;
}

interface Props {
  data: Array<Record<string, string | number>>;
  xKey: string;
  stacks: StackConfig[];
  /** Si true, horizontal layout (mejor para 5+ categorias con labels largos) */
  horizontal?: boolean;
  height?: number;
  yAxisFormat?: (value: number) => string;
  tooltipFormat?: (value: number | string, name?: string) => string;
  showLegend?: boolean;
  /** Barra max ancho en px — default 40 */
  maxBarSize?: number;
  className?: string;
}

function resolveColor(key?: ColorKey): string {
  if (!key) return CHART_PALETTE.primary;
  return CHART_PALETTE[key] ?? CHART_PALETTE.primary;
}

export const BulejeStackedBar = memo(function BulejeStackedBar({
  data,
  xKey,
  stacks,
  horizontal = false,
  height = 280,
  yAxisFormat,
  tooltipFormat,
  showLegend = true,
  maxBarSize = 40,
  className,
}: Props) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 12, right: 16, bottom: 4, left: horizontal ? 60 : 0 }}
        >
          <CartesianGrid
            stroke={CHART_GRID_STROKE}
            strokeDasharray="0"
            horizontal={!horizontal}
            vertical={horizontal}
          />
          <XAxis
            type={horizontal ? "number" : "category"}
            dataKey={horizontal ? undefined : xKey}
            stroke={CHART_AXIS_COLOR}
            fontSize={CHART_FONT.axisSize}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_AXIS_COLOR }}
            tickFormatter={horizontal ? yAxisFormat : undefined}
          />
          <YAxis
            type={horizontal ? "category" : "number"}
            dataKey={horizontal ? xKey : undefined}
            stroke={CHART_AXIS_COLOR}
            fontSize={CHART_FONT.axisSize}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_AXIS_COLOR }}
            tickFormatter={horizontal ? undefined : yAxisFormat}
            // Stack zero-based
            domain={[0, "auto"]}
          />
          <Tooltip
            content={<ChartTooltip format={tooltipFormat} />}
            cursor={{ fill: "var(--rule-soft)", opacity: 0.5 }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                paddingTop: 12,
                fontSize: CHART_FONT.labelSize,
                fontFamily: CHART_FONT.family,
              }}
              iconType="square"
              iconSize={10}
            />
          )}
          {stacks.map((s, idx) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="stack"
              fill={resolveColor(s.color)}
              // Hilo del color de la tarjeta entre segmentos: sin esa ranura,
              // dos tramos contiguos de tono parecido se leen como uno solo.
              stroke="var(--surface-raised)"
              strokeWidth={2}
              // Solo el último tiene radius top
              radius={idx === stacks.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={maxBarSize}
              isAnimationActive={true}
              animationDuration={500 + idx * 80}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
