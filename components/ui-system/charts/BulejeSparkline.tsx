"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { CHART_PALETTE } from "./palette";

interface Props {
  data: number[];
  width?: number | string;
  height?: number;
  trend?: "up" | "down" | "neutral";
  strokeWidth?: number;
}

/**
 * BulejeSparkline — Tiny inline chart for row-level KPIs.
 * No axis, no tooltip. Color según trend.
 */
export function BulejeSparkline({
  data,
  width = 80,
  height = 24,
  trend = "neutral",
  strokeWidth = 1.5,
}: Props) {
  const formatted = data.map((v, i) => ({ i, v }));

  const color =
    trend === "up"
      ? CHART_PALETTE.success
      : trend === "down"
      ? CHART_PALETTE.error
      : CHART_PALETTE.secondary;

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formatted} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={strokeWidth}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
