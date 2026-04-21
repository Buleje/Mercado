"use client";

import {
  BarChart,
  Bar,
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
  horizontal?: boolean;
  barSize?: number;
  radius?: number;
}

/**
 * BulejeBarChart — Editorial bar chart.
 * Barras monochrome (gray-900 default), con hover accent.
 */
export function BulejeBarChart({
  data,
  xKey,
  series,
  height = 240,
  format,
  horizontal = false,
  barSize = 24,
  radius = 4,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 16, bottom: 4, left: horizontal ? 60 : 0 }}
      >
        <CartesianGrid
          stroke={CHART_GRID_STROKE}
          strokeDasharray="0"
          vertical={horizontal}
          horizontal={!horizontal}
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              stroke={CHART_AXIS_COLOR}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: CHART_FONT.axisSize, fontFamily: CHART_FONT.family, fill: CHART_AXIS_COLOR }}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              stroke={CHART_AXIS_COLOR}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: CHART_FONT.axisSize, fontFamily: CHART_FONT.family, fill: CHART_AXIS_COLOR }}
              width={60}
            />
          </>
        ) : (
          <>
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
              width={40}
            />
          </>
        )}
        <Tooltip
          content={<ChartTooltip format={format} />}
          cursor={{ fill: "var(--rule-soft, #f5f5f5)", opacity: 0.5 }}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={SERIES_PALETTE[i % SERIES_PALETTE.length]}
            radius={[radius, radius, 0, 0]}
            maxBarSize={barSize}
            isAnimationActive
            animationDuration={600}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
