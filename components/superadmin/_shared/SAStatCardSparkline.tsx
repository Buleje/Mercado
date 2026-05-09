"use client";

/**
 * SAStatCardSparkline — micro-chart lazy de recharts para SAStatCard.
 * Separado para que next/dynamic descargue recharts solo cuando se necesita
 * una sparkline. Cada card sin sparkline no paga el costo del bundle.
 */

import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface SAStatCardSparklineProps {
  sparkline: number[];
  gradientId: string;
}

export default function SAStatCardSparkline({
  sparkline,
  gradientId,
}: SAStatCardSparklineProps) {
  return (
    <ResponsiveContainer minWidth={0} width="100%" height="100%">
      <AreaChart data={sparkline.map((v, i) => ({ i, v }))}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke="var(--accent)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
