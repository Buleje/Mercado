"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

const SAStatCardSparkline = dynamic(() => import("./SAStatCardSparkline"), {
  ssr: false,
  loading: () => (
    <div className="w-20 h-8 animate-pulse bg-[var(--surface-sunken)] rounded" />
  ),
});

interface SAStatCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  /**
   * CSS color para el top accent bar (brand/tenant-driven). Si se omite,
   * no se pinta la barra. Pasar `var(--accent)` para usar el brand default.
   */
  accent?: string;
  trend?: number;
  sparkline?: number[];
}

/**
 * SAStatCard — card de estadisticas del superadmin.
 *
 * ADR-074 Phase 2:
 * - rounded-2xl -> rounded-xl (consistencia con admin).
 * - `shadow-sm dark:shadow-none` -> `shadow-[var(--shadow-sm)]` (token).
 * - Trend colors `text-green-600/red-500` -> `var(--data-success/error)`.
 * - Sparkline hardcoded `#00A0A0` -> `var(--accent)` + stopColor relativo.
 */
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
  const gradientId = `sg-${label.replace(/[^a-zA-Z0-9]/g, "-")}`;

  return (
    <div className="relative bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 overflow-hidden shadow-[var(--shadow-sm)]">
      {accent && (
        <div
          className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
          style={{ background: accent }}
        />
      )}

      <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-sm mb-3">
        {icon}
        {label}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-3xl font-bold text-[var(--text-primary)] tabular-nums">{value}</div>
          {sub && (
            <div className="text-[var(--text-tertiary)] text-xs mt-1">{sub}</div>
          )}
          {hasTrend && (
            <div
              className={[
                "flex items-center gap-1 text-xs font-semibold mt-1.5 tabular-nums",
                trendUp ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
              ].join(" ")}
            >
              <span>{trendUp ? "↑" : "↓"}</span>
              <span>{Math.abs(trend!)}%</span>
            </div>
          )}
        </div>

        {sparkline && sparkline.length > 1 && (
          <div className="w-20 h-8 shrink-0">
            <SAStatCardSparkline sparkline={sparkline} gradientId={gradientId} />
          </div>
        )}
      </div>
    </div>
  );
}
