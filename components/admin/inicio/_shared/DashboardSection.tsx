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
        "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 " +
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
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
                  "text-sm font-extrabold tabular-nums truncate " +
                  (k.tone === "warning"
                    ? "text-[var(--data-warning)]"
                    : k.tone === "success"
                      ? "text-[var(--data-success)]"
                      : k.tone === "primary"
                        ? "text-[var(--text-primary)]"
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
      {children}
    </section>
  );
}
