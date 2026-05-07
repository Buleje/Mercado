"use client";

import React from "react";
import { CardTitle } from "@buleje/design-system";
import {
  AreaChart,
  Area,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

interface RevenueChartProps {
  title: string;
  period: string;
  currentValue: number;
  currentLabel: string;
  objective?: number;
  mom?: number;
  data: Array<{ month: string; value: number }>;
  prefix?: string;
}

function RevenueChart({
  title,
  period,
  currentValue,
  currentLabel,
  objective,
  mom,
  data,
  prefix = "S/",
}: RevenueChartProps) {
  return (
    <div className="col-span-full bg-white dark:bg-zinc-900 border border-[var(--rule-base)] dark:border-zinc-800 rounded-xl p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <CardTitle as="h2" className="text-sm font-semibold">
            {title}
          </CardTitle>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{period}</p>
          <p className="text-4xl font-bold text-[var(--text-primary)] mt-3">
            {prefix}
            {currentValue.toLocaleString("es-PE", {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">{currentLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {objective !== undefined && (
            <div className="text-right">
              <p className="text-xs text-[var(--text-tertiary)]">Objetivo</p>
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                {prefix}
                {objective.toLocaleString("es-PE")}
              </p>
            </div>
          )}
          {mom !== undefined && (
            <span
              className={cn(
                "text-xs font-medium",
                mom >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
              )}
            >
              {mom >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(mom).toFixed(1)}% MoM
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer minWidth={0} width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f0f0f0"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
              boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
              fontSize: "12px",
            }}
            formatter={(val: unknown) => {
              const n = typeof val === "number" ? val : 0;
              return `${prefix}${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#emeraldGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default React.memo(RevenueChart);
