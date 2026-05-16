"use client";

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { useChartRegistration } from "@/lib/admin/charts-visibility";

export interface SectionKPI {
  label: string;
  value: string;
  tone?: "primary" | "warning" | "success" | "neutral";
}

interface Props {
  kicker: string;
  title: string;
  /**
   * Brandon mayo 2026 v6: bajada en lenguaje plano (1 línea) que explica
   * para qué sirve el chart, no qué muestra técnicamente. Pensada para que
   * un bodeguero de 50 años entienda sin jerga. Ej: "Acá ves quién es tu
   * mejor cliente del mes. Llamalo y agradecele — vuelven más cuando los
   * tratás como persona."
   */
  description?: string;
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
  /**
   * Brandon mayo 2026: id único del chart en su módulo. Si está presente,
   * el chart se registra en ChartsVisibilityProvider y puede ser togglado
   * por el usuario desde el botón "Gráficos".
   */
  chartId?: string;
  /**
   * Indica si el chart tiene datos suficientes. Si false, se oculta por
   * default (el user puede mostrarlo manualmente desde el modal). Solo
   * aplica si `chartId` está presente.
   */
  hasData?: boolean;
  /**
   * Brandon mayo 2026: si false, el chart está OCULTO por default aunque
   * tenga datos. Usado para los charts avanzados/especializados (cohort,
   * waterfall, gauge, funnel, BCG, etc.) que confunden al dueño común.
   * El user los puede activar desde el modal "Gráficos".
   */
  defaultVisible?: boolean;
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
export function DashboardSection({ kicker, title, description, kpis, rightSlot, children, className, hideHeader, chartId, hasData = true, defaultVisible = true }: Props) {
  // Si el chart se registró con un id, consultar visibility. Si no tiene
  // chartId, siempre visible (back-compat con secciones legacy).
  const { visible } = useChartRegistration(chartId ?? "__none__", {
    label: title,
    hasData,
    defaultVisible,
  });
  // Brandon mayo 2026 v6: marker "ghost" para que el wrapper draggable
  // pueda detectar mediante CSS `:has([data-chart-hidden])` y colapsar
  // el slot del grid. Retornar `null` directo dejaba el wrapper en DOM
  // pero vacío → huecos blancos enormes al lado de charts visibles
  // impares cuando los compañeros estaban ocultos por defaultVisible=false.
  if (chartId && !visible) {
    return <div data-chart-hidden="true" style={{ display: "none" }} aria-hidden />;
  }

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
        // Brandon mayo 2026 v2: header agrandado — eyebrow text-xs (era 2xs),
        // título text-lg sm:text-xl (era base) para que se lea a 1m del monitor.
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
              {kicker}
            </p>
            <CardTitle className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
              {title}
            </CardTitle>
            {description && (
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed font-medium">
                {description}
              </p>
            )}
          </div>
          {rightSlot && <div className="flex-shrink-0 pr-10">{rightSlot}</div>}
        </header>
      )}
      {kpis && kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 shrink-0">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-xl border-2 border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3.5"
            >
              <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
                {k.label}
              </p>
              <p
                className={
                  // tone=primary lee la CSS var scoped --section-primary
                  // (fallback a --text-primary). Brandon v2: text-base sm:text-lg
                  // (era text-sm), respiro vertical para que el número resalte.
                  "text-base sm:text-lg font-extrabold tabular-nums truncate " +
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
