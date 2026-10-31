"use client";

/**
 * SuperadminChartCard — wrapper visual unificado para secciones del superadmin.
 *
 * Reemplaza los `<section className="rounded-2xl border ...">` ad-hoc que cada
 * pantalla escribía a mano. Provee:
 *   - kicker (uppercase pequeña sobre el título)
 *   - title (h3 grande, ~1.25rem)
 *   - description (subtítulo corto o dato; a la vista)
 *   - info (explicación larga: va en un ⓘ junto al título, no en un párrafo)
 *   - period (pill chico a la derecha, ej. "30 días")
 *   - actions slot (toggles, exportar, etc.)
 *
 * No duplica `ChartWrapper` del DS — ese maneja el header de UN chart concreto.
 * `SuperadminChartCard` agrupa secciones a nivel de página.
 */

import type { ReactNode } from "react";
import { InfoTip } from "./InfoTip";

// Superficie canónica = ADMIN_TOKENS.card (rounded-xl · rule-soft · surface-raised).
// Inline para no acoplar el componente al re-export del admin layer.
const SA_CARD = "rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]";

interface Props {
  title: string;
  description?: string;
  /** Explicación: se ve al pasar por el ⓘ junto al título (regla «sin párrafos»). */
  info?: string;
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
  info,
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
        SA_CARD,
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
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <h3 className="truncate text-xl font-extrabold text-[var(--text-primary)]">{title}</h3>
            {info && <InfoTip title={title} what={info} />}
          </div>
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
