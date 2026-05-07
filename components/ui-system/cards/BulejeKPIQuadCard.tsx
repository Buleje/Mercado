"use client";

import { memo } from "react";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { BulejeSparkline } from "../charts/BulejeSparkline";

/**
 * BulejeKPIQuadCard — 4 KPIs en 1 card (2x2 grid).
 *
 * Cada celda tiene: kicker, value, delta, mini-sparkline.
 * Reemplaza 4 cards separadas en 1 card denso — saves 75% vertical space.
 *
 * @example
 * <BulejeKPIQuadCard
 *   kpis={[
 *     { kicker: "Ventas", value: 18420, prefix: "S/ ", delta: 12.5, sparkline: [...] },
 *     { kicker: "Pedidos", value: 64, delta: -2.1, sparkline: [...] },
 *     { kicker: "Clientes", value: 42, delta: 28, sparkline: [...] },
 *     { kicker: "Margen", value: 23.4, suffix: "%", delta: 1.2, sparkline: [...] },
 *   ]}
 * />
 */

interface KPICell {
  kicker: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delta?: number;
  sparkline?: number[];
}

interface Props {
  kpis: KPICell[];
  loading?: boolean;
  className?: string;
}

export const BulejeKPIQuadCard = memo(function BulejeKPIQuadCard({
  kpis,
  loading = false,
  className,
}: Props) {
  if (loading) {
    return (
      <div className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}>
        <div className="grid grid-cols-2 divide-x divide-[var(--rule-soft)]">
          {[0, 1].map((i) => (
            <div key={i} className="divide-y divide-[var(--rule-soft)]">
              {[0, 1].map((j) => (
                <div key={j} className="p-5">
                  <div className="skeleton-v4 h-3 w-16 mb-2" />
                  <div className="skeleton-v4 h-7 w-24 mb-2" />
                  <div className="skeleton-v4 h-4 w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Ensure exactly 4 slots
  const slots = [...kpis.slice(0, 4)];
  while (slots.length < 4) {
    slots.push({ kicker: "—", value: 0 });
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
    >
      <div className="grid grid-cols-2 divide-x divide-[var(--rule-soft)]">
        {/* Columna izquierda */}
        <div className="divide-y divide-[var(--rule-soft)]">
          <KPICellRender kpi={slots[0]} />
          <KPICellRender kpi={slots[2]} />
        </div>
        {/* Columna derecha */}
        <div className="divide-y divide-[var(--rule-soft)]">
          <KPICellRender kpi={slots[1]} />
          <KPICellRender kpi={slots[3]} />
        </div>
      </div>
    </div>
  );
});

function KPICellRender({ kpi }: { kpi: KPICell }) {
  const dir: "up" | "down" | "flat" =
    kpi.delta == null ? "flat" : kpi.delta > 0 ? "up" : kpi.delta < 0 ? "down" : "flat";

  return (
    <div className="p-4 sm:p-5">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
        {kpi.kicker}
      </p>
      <div className="flex items-baseline gap-0.5 mb-1">
        {kpi.prefix && (
          <span className="text-sm font-bold text-[var(--text-tertiary)]">{kpi.prefix}</span>
        )}
        <NumberFlow
          value={kpi.value}
          format={{ maximumFractionDigits: kpi.decimals ?? 0 }}
          className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none"
        />
        {kpi.suffix && (
          <span className="text-base font-semibold text-[var(--text-tertiary)]">{kpi.suffix}</span>
        )}
      </div>

      {/* Delta + sparkline en la misma fila */}
      <div className="mt-3 flex items-center justify-between gap-2">
        {kpi.delta != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-bold tabular-nums",
              dir === "up" && "text-[var(--data-success-500)]",
              dir === "down" && "text-[var(--data-error-500)]",
              dir === "flat" && "text-[var(--text-tertiary)]",
            )}
          >
            {dir === "up" && "↑"}
            {dir === "down" && "↓"}
            {Math.abs(kpi.delta).toFixed(1)}%
          </span>
        )}
        {kpi.sparkline && kpi.sparkline.length > 1 && (
          <BulejeSparkline
            data={kpi.sparkline}
            trend={dir === "flat" ? "neutral" : dir}
            width={60}
            height={20}
          />
        )}
      </div>
    </div>
  );
}
