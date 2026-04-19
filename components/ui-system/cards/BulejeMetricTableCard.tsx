"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BulejeSparkline } from "../charts/BulejeSparkline";

/**
 * BulejeMetricTableCard — tabla compacta con sparkline inline por fila.
 *
 * Uso: Top 5 productos/clientes/categorias con trend individual.
 * Muestra 10x mas información que una lista simple sin ocupar más espacio.
 *
 * @example
 * <BulejeMetricTableCard
 *   kicker="Top productos"
 *   sublabel="Últimos 7 días"
 *   rows={[
 *     { id: "arroz", label: "Arroz Costeño 5kg", value: 2840, prefix: "S/ ", trend: [...] },
 *     { id: "aceite", label: "Aceite Primor 1L", value: 1920, prefix: "S/ ", trend: [...] },
 *     ...
 *   ]}
 *   viewAllHref="/admin?module=productos"
 * />
 */

interface RowData {
  id: string;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: number[];
  /** delta % vs periodo anterior */
  delta?: number;
}

interface Props {
  kicker: string;
  sublabel?: string;
  rows: RowData[];
  viewAllHref?: string;
  viewAllLabel?: string;
  loading?: boolean;
  /** Max rows a mostrar — default 5 */
  maxRows?: number;
  className?: string;
}

export const BulejeMetricTableCard = memo(function BulejeMetricTableCard({
  kicker,
  sublabel,
  rows,
  viewAllHref,
  viewAllLabel = "Ver todos",
  loading = false,
  maxRows = 5,
  className,
}: Props) {
  const displayRows = rows.slice(0, maxRows);

  if (loading) {
    return (
      <div className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}>
        <div className="px-5 py-3 border-b border-[var(--rule-soft)]">
          <div className="skeleton-v4 h-3 w-24" />
        </div>
        <div className="divide-y divide-[var(--rule-soft)]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <div className="skeleton-v4 h-4 flex-1" />
              <div className="skeleton-v4 h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
      aria-labelledby={`table-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <header className="px-5 py-3 border-b border-[var(--rule-soft)] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            id={`table-${kicker.replace(/\s+/g, "-").toLowerCase()}`}
            className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
          >
            {kicker}
          </p>
          {sublabel && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{sublabel}</p>
          )}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {viewAllLabel}
            <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        )}
      </header>
      <ol className="divide-y divide-[var(--rule-soft)]">
        {displayRows.map((row, idx) => {
          const dir: "up" | "down" | "flat" =
            row.delta == null ? "flat" : row.delta > 0 ? "up" : row.delta < 0 ? "down" : "flat";
          return (
            <li key={row.id} className="px-5 py-3 flex items-center gap-3 hover:bg-[var(--surface-sunken)] transition-colors">
              {/* Rank */}
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                {idx + 1}
              </span>
              {/* Label */}
              <span className="flex-1 text-sm font-semibold text-[var(--text-primary)] truncate">
                {row.label}
              </span>
              {/* Inline sparkline */}
              {row.trend && row.trend.length > 1 && (
                <span className="shrink-0">
                  <BulejeSparkline
                    data={row.trend}
                    trend={dir === "flat" ? "neutral" : dir}
                    width={60}
                    height={20}
                  />
                </span>
              )}
              {/* Value */}
              <span className="shrink-0 text-right">
                <span className="text-sm font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
                  {row.prefix}
                  {row.value.toLocaleString("es-PE", {
                    minimumFractionDigits: row.decimals ?? 0,
                    maximumFractionDigits: row.decimals ?? 0,
                  })}
                  {row.suffix}
                </span>
                {row.delta != null && (
                  <span
                    className={cn(
                      "block text-[length:var(--ts-2xs)] font-bold tabular-nums",
                      dir === "up" && "text-[var(--data-success)]",
                      dir === "down" && "text-[var(--data-error)]",
                      dir === "flat" && "text-[var(--text-tertiary)]",
                    )}
                  >
                    {dir === "up" && "↑"}
                    {dir === "down" && "↓"}
                    {Math.abs(row.delta).toFixed(1)}%
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});
