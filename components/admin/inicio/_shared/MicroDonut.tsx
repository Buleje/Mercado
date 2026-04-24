"use client";

/**
 * MicroDonut — donut compacto (180px) para fila 4 de micro-insights.
 *
 * Renderiza:
 *  - PieChart donut con innerRadius/outerRadius optimizados para 180px
 *  - Centro con valor total (string) o vacio
 *  - Leyenda inline debajo (max 4 items, resto agrupado en "Otros")
 *
 * Uso:
 *   <MicroDonut
 *     data={[{ name: "Yape", value: 200, color: "#8b5cf6" }, ...]}
 *     centerLabel="S/ 1.2k"
 *     centerSubLabel="Total"
 *   />
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltip } from "./ChartCard";

export interface MicroDonutDatum {
  name: string;
  value: number;
  color: string;
}

interface MicroDonutProps {
  data: MicroDonutDatum[];
  /** Valor central (string formateado). */
  centerLabel?: string;
  /** Sub-label central (sobre el center label, mas pequeño). */
  centerSubLabel?: string;
  /** Prefijo del tooltip. Default "" (número). */
  tooltipPrefix?: string;
  /** Formatter del tooltip. */
  tooltipFormatter?: (v: number) => string;
  /** Altura del chart. Default 180. */
  height?: number;
  /** Número max de items en leyenda. Default 4. */
  maxLegendItems?: number;
}

export function MicroDonut({
  data,
  centerLabel,
  centerSubLabel,
  tooltipPrefix = "",
  tooltipFormatter,
  height = 180,
  maxLegendItems = 4,
}: MicroDonutProps) {
  // Total para porcentajes
  const total = data.reduce((a, d) => a + d.value, 0);

  // Top N items + "Otros"
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const topItems = sorted.slice(0, maxLegendItems);
  const restValue = sorted.slice(maxLegendItems).reduce((a, d) => a + d.value, 0);
  const legendItems =
    restValue > 0
      ? [...topItems, { name: "Otros", value: restValue, color: "#94a3b8" }]
      : topItems;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative w-full" style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip prefix={tooltipPrefix} formatter={tooltipFormatter} />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {centerSubLabel && (
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted leading-none">
                {centerSubLabel}
              </span>
            )}
            <span className="text-base font-bold text-[var(--text-primary)] dark:text-foreground tabular-nums leading-tight mt-0.5">
              {centerLabel}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center w-full">
        {legendItems.map((item, i) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <span
              key={i}
              className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate max-w-[80px]">{item.name}</span>
              <span className="font-bold text-[var(--text-primary)] dark:text-foreground">
                {pct}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
