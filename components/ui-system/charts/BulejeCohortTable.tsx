"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * BulejeCohortTable — matriz de retencion de cohortes.
 *
 * Cada fila = cohorte (semana/mes de adquisicion).
 * Cada columna = periodo transcurrido (M0, M1, M2...).
 * Intensidad de celda = % de retencion.
 *
 * @example
 * <BulejeCohortTable
 *   cohorts={[
 *     { label: "Ene 2026", size: 120, retention: [100, 65, 42, 28] },
 *     { label: "Feb 2026", size: 180, retention: [100, 72, 48, null] },
 *     ...
 *   ]}
 *   periodLabels={["M0", "M1", "M2", "M3"]}
 * />
 */

export interface CohortRow {
  /** Etiqueta de la cohorte — ej "Ene 2026", "S1" */
  label: string;
  /** Numero inicial de usuarios/clientes */
  size: number;
  /** Retencion % por periodo (null = no data) */
  retention: (number | null)[];
}

interface BulejeCohortTableProps {
  cohorts: CohortRow[];
  periodLabels: string[];
  label?: string;
  sublabel?: string;
  className?: string;
}

export const BulejeCohortTable = memo(function BulejeCohortTable({
  cohorts,
  periodLabels,
  label,
  sublabel,
  className,
}: BulejeCohortTableProps) {
  const intensity = (v: number | null) => {
    if (v == null) return null;
    return Math.max(0.05, Math.min(1, v / 100));
  };

  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5", className)}>
      {(label || sublabel) && (
        <div className="mb-5">
          {label && (
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-1">
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

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              <th className="text-left pb-3 font-bold">Cohorte</th>
              <th className="text-right pb-3 font-bold tabular-nums pr-3">N</th>
              {periodLabels.map((p) => (
                <th key={p} className="text-center pb-3 font-bold tabular-nums px-1">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={cohort.label} className="border-t border-[var(--rule-soft)]">
                <td className="py-2 text-xs font-semibold text-[var(--text-primary)]">
                  {cohort.label}
                </td>
                <td className="py-2 text-right text-xs font-bold text-[var(--text-tertiary)] tabular-nums pr-3">
                  {cohort.size.toLocaleString("es-PE")}
                </td>
                {periodLabels.map((_, pIdx) => {
                  const v = cohort.retention[pIdx];
                  const i = intensity(v);
                  return (
                    <td key={pIdx} className="py-1 px-1">
                      {v == null ? (
                        <div className="h-8 rounded-md bg-[var(--surface-sunken)]" />
                      ) : (
                        <div
                          className="h-8 flex items-center justify-center rounded-md"
                          style={{
                            background: `color-mix(in oklab, var(--accent) ${(i || 0) * 100}%, var(--surface-sunken))`,
                          }}
                        >
                          <span
                            className={cn(
                              "text-[11px] font-bold tabular-nums",
                              i && i > 0.5 ? "text-white" : "text-[var(--text-primary)]",
                            )}
                          >
                            {v.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
