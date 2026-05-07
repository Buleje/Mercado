"use client";

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";

export interface SectionKPI {
  label: string;
  value: string;
  tone?: "primary" | "warning" | "success" | "neutral";
}

interface Props {
  kicker: string;
  title: string;
  kpis?: SectionKPI[];
  /** right-aligned header slot (ej: badge de tendencia, action button) */
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Si true, no renderiza el header (kicker + title). Útil en dashboards
   * compactos donde KPIs + chart ya comunican el contenido sin necesidad
   * de texto descriptivo arriba. KPIs y rightSlot se siguen mostrando.
   */
  hideHeader?: boolean;
}

/**
 * DashboardSection — wrapper visual unificado para secciones del dashboard.
 *
 * Patrón:
 *  - Kicker (label pequeño uppercase)
 *  - Title (CardTitle)
 *  - rightSlot opcional para badges/actions en esquina derecha
 *  - KPIs inline (grid 2/4) opcional
 *  - Chart/contenido
 *
 * Se usa en Resumen, Ventas base y Ventas advanced para consistencia total.
 */
export function DashboardSection({ kicker, title, kpis, rightSlot, children, className, hideHeader }: Props) {
  return (
    <section
      className={
        // h-full + flex-col asegura que el chart (children) se estire al alto
        // disponible cuando el padre usa gridAutoRows: 1fr. Sin huecos entre
        // secciones de la misma fila.
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 h-full flex flex-col " +
        (className ?? "")
      }
    >
      {hideHeader ? (
        rightSlot && (
          <div className="mb-4 flex justify-end">
            <div className="flex-shrink-0 pr-10">{rightSlot}</div>
          </div>
        )
      ) : (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              {kicker}
            </p>
            <CardTitle className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              {title}
            </CardTitle>
          </div>
          {rightSlot && <div className="flex-shrink-0 pr-10">{rightSlot}</div>}
        </header>
      )}
      {kpis && kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 shrink-0">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5"
            >
              <p className="text-[length:var(--ts-3xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                {k.label}
              </p>
              <p
                className={
                  // 2026-04-24: tone=primary lee la CSS var scoped
                  // --section-primary (fallback a --text-primary). Asi cada
                  // seccion diferencia su KPI numerico con su color tema.
                  "text-sm font-extrabold tabular-nums truncate " +
                  (k.tone === "warning"
                    ? "text-[var(--data-warning-500)]"
                    : k.tone === "success"
                      ? "text-[var(--data-success-500)]"
                      : k.tone === "primary"
                        ? "text-[color:var(--section-primary,var(--text-primary))]"
                        : "text-[var(--text-secondary)]")
                }
                title={k.value}
              >
                {k.value}
              </p>
            </div>
          ))}
        </div>
      )}
      {/* children wrapper con flex-1 min-h-0 para que el chart (ResponsiveContainer
          de Recharts) se estire al espacio restante sin desbordar. */}
      <div className="flex-1 min-h-0 flex flex-col justify-end">{children}</div>
    </section>
  );
}
