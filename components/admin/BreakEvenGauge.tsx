"use client";

/**
 * BreakEvenGauge — subcomponente lazy-loaded.
 * Radial bar chart (gauge) del punto de equilibrio diario.
 * Extraido de BreakEvenDashboard para lazy-load de recharts.
 */

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface Props {
  progress: number;
  reached: boolean;
}

export default function BreakEvenGauge({ progress, reached }: Props) {
  const gaugeData = [
    {
      name: "Progreso",
      value: progress,
      fill: reached
        ? "var(--data-success)"
        : progress > 60
          ? "var(--data-warning)"
          : "var(--data-error)",
    },
  ];

  return (
    <>
      <ResponsiveContainer>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          barSize={20}
          data={gaugeData}
          startAngle={210}
          endAngle={-30}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            background={{ fill: "var(--surface-sunken)" }}
            dataKey="value"
            cornerRadius={10}
            isAnimationActive
          />
        </RadialBarChart>
      </ResponsiveContainer>
      {/* Centro del gauge */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Progreso
        </p>
        <p
          className={cn(
            "text-4xl font-extrabold tabular-nums tracking-tight leading-none mt-1",
            reached
              ? "text-[var(--data-success-500)]"
              : progress > 60
                ? "text-[var(--data-warning-500)]"
                : "text-[var(--data-error-500)]",
          )}
        >
          {Number(progress).toFixed(0)}%
        </p>
        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">
          {reached ? "Punto alcanzado" : "Hacia la meta"}
        </p>
      </div>
    </>
  );
}
