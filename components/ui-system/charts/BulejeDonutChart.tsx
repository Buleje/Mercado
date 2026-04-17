"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { SERIES_PALETTE } from "./palette";
import { ChartTooltip } from "./ChartTooltip";

interface DataPoint {
  name: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  label?: React.ReactNode;
  format?: (value: number | string) => string;
}

/**
 * BulejeDonutChart — Editorial donut.
 * Max 5 segmentos. Paleta mono+accent. Etiqueta central opcional.
 */
export function BulejeDonutChart({
  data,
  height = 200,
  innerRadius = 60,
  outerRadius = 85,
  label,
  format,
}: Props) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
            isAnimationActive
            animationDuration={500}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip format={format} />} />
        </PieChart>
      </ResponsiveContainer>
      {label && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {label}
        </div>
      )}
    </div>
  );
}
