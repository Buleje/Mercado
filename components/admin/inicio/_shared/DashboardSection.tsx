"use client";

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useChartRegistration } from "@/lib/admin/charts-visibility";
import { KpiTile, gridDeKpis, type SectionKPI } from "./KpiTile";

// El tipo vive con la tarjeta; se re-exporta acá para no romper los imports.
export type { SectionKPI };

/**
 * Hasta este largo la bajada entra en UNA línea a 400 px y queda a la vista;
 * más larga es un párrafo y pasa al ⓘ del título (ley de la vista, regla 9).
 */
const BAJADA_A_LA_VISTA_MAX = 48;

interface Props {
  kicker: string;
  title: string;
  /**
   * Brandon mayo 2026 v6: bajada en lenguaje plano (1 línea) que explica
   * para qué sirve el chart, no qué muestra técnicamente. Pensada para que
   * un bodeguero de 50 años entienda sin jerga. Ej: "Acá ves quién es tu
   * mejor cliente del mes. Llamalo y agradecele — vuelven más cuando los
   * tratás como persona."
   *
   * 2026-10-09: si pasa de ~48 caracteres va al ⓘ al lado del título (ley de
   * la vista: explicar con ⓘ, no con párrafos); corta, queda como bajada.
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
   * Indica si el chart tiene datos suficientes. Si false, se oculta (aunque
   * el usuario lo haya prendido antes) hasta que llegue un dato; en el botón
   * «Gráficos» figura como «Sin datos todavía» y se puede mostrar igual.
   * Calcularlo con `lib/admin/inicio/hay-datos` (`hayDatosEnSerie`,
   * `hayTendencia`, `hayFilas`). Solo aplica si `chartId` está presente.
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
    return (
      <div
        data-chart-hidden="true"
        data-chart-sin-datos={hasData ? undefined : "true"}
        style={{ display: "none" }}
        aria-hidden
      />
    );
  }
  const bajadaEnInfo = !!description && description.length > BAJADA_A_LA_VISTA_MAX;

  return (
    <section
      data-dashboard-section=""
      data-chart-id={chartId}
      className={
        // h-full + flex-col asegura que el chart (children) se estire al alto
        // disponible cuando el padre usa gridAutoRows: 1fr. Sin huecos entre
        // secciones de la misma fila.
        // @container: la fila de KPIs elige columnas por el ancho de la SECCIÓN.
        "@container border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 h-full flex flex-col " +
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
            <div className="flex min-w-0 items-center gap-1.5">
              <CardTitle className="min-w-0 text-[length:var(--ts-xl)] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
                {title}
              </CardTitle>
              {bajadaEnInfo && (
                <InfoTip title={title} what={description} className="shrink-0" ariaLabel={`Qué muestra «${title}»`} />
              )}
            </div>
            {description && !bajadaEnInfo && (
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-snug font-medium">
                {description}
              </p>
            )}
          </div>
          {rightSlot && <div className="flex-shrink-0 pr-10">{rightSlot}</div>}
        </header>
      )}
      {kpis && kpis.length > 0 && (
        <div className={gridDeKpis(kpis.length) + " mb-6 shrink-0"}>
          {kpis.map((k) => (
            <KpiTile key={k.label} kpi={k} />
          ))}
        </div>
      )}
      {/* children wrapper con flex-1 min-h-0 para que el chart (ResponsiveContainer
          de Recharts) se estire al espacio restante sin desbordar. */}
      <div className="flex-1 min-h-0 flex flex-col justify-end">{children}</div>
    </section>
  );
}
