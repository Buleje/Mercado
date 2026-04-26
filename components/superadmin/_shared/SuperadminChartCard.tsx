"use client";

/**
 * SuperadminChartCard — wrapper visual unificado para secciones del superadmin.
 *
 * Reemplaza los `<section className="rounded-2xl border ...">` ad-hoc que cada
 * pantalla escribía a mano. Provee:
 *   - kicker (uppercase pequeña sobre el título)
 *   - title (h3 grande, ~1.25rem)
 *   - description (subtítulo)
 *   - period (pill chico a la derecha, ej. "30 días")
 *   - actions slot (toggles, exportar, etc.)
 *
 * No duplica `ChartWrapper` del DS — ese maneja el header de UN chart concreto.
 * `SuperadminChartCard` agrupa secciones a nivel de página.
 */

import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  /** Etiqueta de período, render como pill */
  period?: string;
  /** Botones/toggles a la derecha del header */
  actions?: ReactNode;
  /** Texto pequeño uppercase encima del título */
  kicker?: string;
  /** Padding interno; default normal */
  density?: "compact" | "normal" | "spacious";
  className?: string;
  children: ReactNode;
}

export default function SuperadminChartCard({
  title,
  description,
  period,
  actions,
  kicker,
  density = "normal",
  className,
  children,
}: Props) {
  const padding =
    density === "compact" ? "p-4" : density === "spacious" ? "p-6 sm:p-8" : "p-5 sm:p-6";

  return (
    <section
      className={[
        "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]",
        padding,
        className ?? "",
      ].join(" ")}
    >
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          {kicker && (
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              {kicker}
            </p>
          )}
          <h3 className="text-xl font-extrabold text-[var(--text-primary)] mt-1 truncate">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-[var(--text-secondary)] mt-1">{description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {period && (
            <span className="text-xs font-semibold text-[var(--text-tertiary)] px-2.5 py-1 rounded-full bg-[var(--surface-sunken)]">
              {period}
            </span>
          )}
          {actions}
        </div>
      </header>
      {children}
    </section>
  );
}
