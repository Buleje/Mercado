"use client";

import {
  LineChart,
  Line,
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
  SERIES_PALETTE,
} from "./palette";
import { ChartTooltip } from "./ChartTooltip";

interface Series {
  key: string;
  label: string;
}

interface Props {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Series[];
  height?: number;
  format?: (value: number | string, name?: string) => string;
  yTicks?: number;
  strokeWidth?: number;
  showDots?: boolean;
}

/**
 * BulejeLineChart — Editorial line chart.
 * Monochrome + accent, minimal grid (horizontal only), tooltip custom.
 */
export function BulejeLineChart({
  data,
  xKey,
  series,
  height = 240,
  format,
  yTicks = 4,
  strokeWidth = 1.5,
  showDots = false,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid
          stroke={CHART_GRID_STROKE}
          strokeDasharray="0"
          vertical={false}
        />
        <XAxis
          dataKey={xKey}
          stroke={CHART_AXIS_COLOR}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: CHART_FONT.axisSize, fontFamily: CHART_FONT.family, fill: CHART_AXIS_COLOR }}
          dy={8}
        />
        <YAxis
          stroke={CHART_AXIS_COLOR}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: CHART_FONT.axisSize, fontFamily: CHART_FONT.family, fill: CHART_AXIS_COLOR }}
          tickCount={yTicks}
          width={40}
        />
        <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: CHART_GRID_STROKE, strokeWidth: 1 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES_PALETTE[i % SERIES_PALETTE.length]}
            strokeWidth={strokeWidth}
            dot={showDots ? { r: 3, strokeWidth: 0, fill: SERIES_PALETTE[i % SERIES_PALETTE.length] } : false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-canvas, #fff)" }}
            isAnimationActive
            animationDuration={600}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
