"use client";

import { useId, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useChartRegistration } from "@/lib/admin/charts-visibility";
import { KpiTile, esKpiSinDato, gridDeKpis, type SectionKPI } from "./KpiTile";

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
  /**
   * 2026-10-11 (Inicio a ≤2 pantallas): clave para plegar el bloque y
   * recordarlo («inicio:<vista>:<bloque>»). Plegado queda el título y, en una
   * línea, sus dos primeras cifras con dato: plegar no es esconder el dato.
   */
  plegable?: string;
  /** Cómo arranca un bloque `plegable` la primera vez (default: plegado). */
  abiertoAlInicio?: boolean;
  /** Las cifras de la línea plegada cuando el bloque las dibuja adentro (no por `kpis`). */
  cifrasPlegado?: SectionKPI[];
}

/** «Valor del stock: S/ 10,923.22 · Bajo stock: 1» — las cifras del bloque plegado. */
function lineaPlegada(kpis: SectionKPI[] | undefined): string {
  return (kpis ?? [])
    .filter((k) => !esKpiSinDato(k))
    .slice(0, 2)
    .map((k) => `${k.label}: ${k.value}`)
    .join(" · ");
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
export function DashboardSection({ kicker, title, description, kpis, rightSlot, children, className, hideHeader, chartId, hasData = true, defaultVisible = true, plegable, abiertoAlInicio = false, cifrasPlegado }: Props) {
  // Los hooks van antes del retorno temprano del gráfico oculto.
  const [guardado, setGuardado] = useLocalStorage<boolean>(plegable ?? "inicio:sin-plegar", abiertoAlInicio);
  const abierto = !plegable || guardado;
  const idCuerpo = `${useId()}-cuerpo`;
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
        // Plegada no se estira al alto de la vecina de fila (self-start).
        "@container border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 flex flex-col " +
        (abierto ? "h-full " : "self-start w-full ") +
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
        <header className={(abierto ? "mb-5 " : "") + "flex items-start justify-between gap-3"}>
          <div className={plegable ? "min-w-0 flex-1" : "min-w-0"}>
            <p className="text-sm font-bold text-[var(--text-tertiary)] mb-1">
              {kicker}
            </p>
            <div className="flex min-w-0 items-center gap-1.5">
              <CardTitle className="min-w-0 text-[length:var(--ts-xl)] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
                {plegable ? (
                  // -my-2.5 + min-h-12: 48 px para el dedo sin agrandar la cabecera.
                  <button
                    type="button"
                    aria-expanded={abierto}
                    aria-controls={idCuerpo}
                    onClick={() => setGuardado(!abierto)}
                    className="-mx-2 -my-2.5 inline-flex min-h-12 items-center gap-2 rounded-lg px-2 text-left hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <span>{title}</span>
                    <ChevronDown
                      aria-hidden
                      className={"h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-fast)] " + (abierto ? "rotate-180" : "")}
                    />
                  </button>
                ) : (
                  title
                )}
              </CardTitle>
              {bajadaEnInfo && (
                <InfoTip title={title} what={description} className="shrink-0" ariaLabel={`Qué muestra «${title}»`} />
              )}
            </div>
            {description && !bajadaEnInfo && abierto && (
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-snug font-medium">
                {description}
              </p>
            )}
            {!abierto && lineaPlegada(kpis ?? cifrasPlegado) && (
              <p className="mt-1.5 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">{lineaPlegada(kpis ?? cifrasPlegado)}</p>
            )}
          </div>
          {rightSlot && <div className="flex-shrink-0 pr-10">{rightSlot}</div>}
        </header>
      )}
      {abierto && kpis && kpis.length > 0 && (
        <div className={gridDeKpis(kpis.length) + " mb-6 shrink-0"}>
          {kpis.map((k) => (
            <KpiTile key={k.label} kpi={k} />
          ))}
        </div>
      )}
      {/* children wrapper con flex-1 min-h-0 para que el chart (ResponsiveContainer
          de Recharts) se estire al espacio restante sin desbordar. Plegado no se
          monta: el gráfico sigue anotado en «Gráficos» (lo registra esta sección). */}
      {abierto ? (
        <div id={idCuerpo} className="flex-1 min-h-0 flex flex-col justify-end">{children}</div>
      ) : (
        <div id={idCuerpo} hidden />
      )}
    </section>
  );
}
