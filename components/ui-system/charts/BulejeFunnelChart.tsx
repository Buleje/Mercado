"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * BulejeFunnelChart — funnel de conversion editorial.
 *
 * Cada etapa muestra: nombre, valor absoluto, % vs etapa anterior,
 * % vs total. Renderizado con barras horizontales de ancho proporcional.
 *
 * @example
 * <BulejeFunnelChart
 *   stages={[
 *     { label: "Visitas", value: 1000 },
 *     { label: "Agregaron al carrito", value: 320 },
 *     { label: "Iniciaron checkout", value: 180 },
 *     { label: "Completaron pedido", value: 120 },
 *   ]}
 * />
 */

export interface FunnelStage {
  label: string;
  value: number;
  /** Sublabel opcional — ej "ultimos 7 dias" */
  sublabel?: string;
}

interface BulejeFunnelChartProps {
  stages: FunnelStage[];
  label?: string;
  sublabel?: string;
  className?: string;
  /** Formato de valor — default es-PE */
  valueFormat?: (value: number) => string;
}

export const BulejeFunnelChart = memo(function BulejeFunnelChart({
  stages,
  label,
  sublabel,
  className,
  valueFormat = (v) => v.toLocaleString("es-PE"),
}: BulejeFunnelChartProps) {
  const topValue = stages[0]?.value || 1;

  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5", className)}>
      {(label || sublabel) && (
        <div className="mb-6">
          {label && (
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              {label}
            </p>
          )}
          {sublabel && (
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              {sublabel}
            </h3>
          )}
        </div>
      )}

      <div className="space-y-3">
        {stages.map((stage, idx) => {
          const widthPercent = (stage.value / topValue) * 100;
          const prev = idx > 0 ? stages[idx - 1].value : null;
          const dropRate = prev != null && prev > 0 ? ((prev - stage.value) / prev) * 100 : null;
          const pctOfTop = (stage.value / topValue) * 100;

          return (
            <div key={stage.label}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] tabular-nums">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
                    {stage.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
                    {valueFormat(stage.value)}
                  </span>
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] tabular-nums">
                    {pctOfTop.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="relative h-8 rounded-md bg-[var(--surface-sunken)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-[var(--data-1)] transition-all"
                  style={{
                    width: `${widthPercent}%`,
                    transitionDuration: "0.6s",
                    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDelay: `${idx * 0.08}s`,
                  }}
                />
                {idx > 0 && dropRate != null && dropRate > 0 && (
                  <div className="absolute inset-y-0 right-2 flex items-center">
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-error,#b91c1c)] tabular-nums">
                      -{dropRate.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              {stage.sublabel && (
                <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{stage.sublabel}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall conversion */}
      {stages.length > 1 && (
        <div className="mt-6 pt-4 border-t border-[var(--rule-soft)] flex items-center justify-between">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Conversión total
          </span>
          <span className="text-xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
            {((stages[stages.length - 1].value / topValue) * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
});
