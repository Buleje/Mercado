"use client";

import type { ReactNode } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface SAStatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  trend?: number;
  sparkline?: number[];
}

export function SAStatCard({
  icon,
  label,
  value,
  sub,
  accent,
  trend,
  sparkline,
}: SAStatCardProps) {
  const hasTrend = trend !== undefined;
  const trendUp = (trend ?? 0) >= 0;

  return (
    <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 overflow-hidden shadow-sm dark:shadow-none">
      {accent && (
        <div
          className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
          style={{ background: accent }}
        />
      )}

      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-3">
        {icon}
        {label}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{value}</div>
          {sub && (
            <div className="text-gray-400 dark:text-gray-500 text-xs mt-1">{sub}</div>
          )}
          {hasTrend && (
            <div
              className={[
                "flex items-center gap-1 text-xs font-semibold mt-1.5",
                trendUp ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400",
              ].join(" ")}
            >
              <span>{trendUp ? "↑" : "↓"}</span>
              <span>{Math.abs(trend!)}%</span>
            </div>
          )}
        </div>

        {sparkline && sparkline.length > 1 && (
          <div className="w-20 h-8 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkline.map((v, i) => ({ i, v }))}>
                <defs>
                  <linearGradient id={`sg-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#0f766e"
                  strokeWidth={1.5}
                  fill={`url(#sg-${label})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
