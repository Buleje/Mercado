"use client";

/**
 * Lo que la cabecera de una sección del Libro TH manda al riel del libro
 * (compactación 17-10, Brandon: «Indicadores chicos… botones junto a las
 * pestañas»):
 *  · el ⓘ con qué se asienta en la sección (era la frase al lado del título);
 *  · «Indicadores» en ícono + cuántas tarjetas, como en el Libro CTP. Las
 *    cifras plegadas van al `title`; lo que pide atención —las líneas fuera de
 *    plazo, un filtro puesto— queda a la vista en el botón.
 * El título de la sección ya lo dice el riel de secciones, resaltado.
 * Fuera del libro no se usa: la cabecera se ve como siempre.
 */

import { AlertCircle, BarChart3, ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AccionesDeLaVista, ORDEN_ACCION } from "@/components/admin/shared/libro-acciones-vista";
import { formatNumber } from "@/lib/format";

export default function IndicadoresSeccionEnRiel({
  titulo,
  ayuda,
  abierto,
  onAlternar,
  controla,
  tarjetas,
  resumen,
  tardias,
  filtrando,
}: {
  titulo: string;
  ayuda: string;
  abierto: boolean;
  onAlternar: () => void;
  /** id del panel que pliega. */
  controla: string;
  /** Cuántas tarjetas hay en el panel. */
  tarjetas: number;
  /** Las cifras plegadas en una línea, las mismas que las tarjetas. */
  resumen: string;
  tardias: number;
  filtrando: boolean;
}) {
  return (
    <>
      <AccionesDeLaVista orden={ORDEN_ACCION.info}>
        <InfoTip title={titulo} what={ayuda} />
      </AccionesDeLaVista>
      <AccionesDeLaVista orden={ORDEN_ACCION.indicadores}>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          aria-controls={controla}
          aria-label={`Indicadores (${tarjetas})`}
          title={abierto ? "Ocultar los indicadores. Se recuerda para las seis secciones." : `Ver los indicadores · ${resumen}`}
          className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border-[1.5px] px-3 text-sm font-bold transition-colors ${
            abierto
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]"
          }`}
        >
          <BarChart3 className="h-4 w-4 shrink-0" aria-hidden />
          <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-1.5 tabular-nums text-[var(--text-tertiary)]">
            {tarjetas}
          </span>
          {/* Lo tardío no se esconde tras un clic: es lo primero que mira una fiscalización. */}
          {!abierto && tardias > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-1.5 text-xs tabular-nums text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              {formatNumber(tardias)}
              <span className="sr-only">fuera de plazo</span>
            </span>
          )}
          {filtrando && (
            <span title="Las cifras son de lo que deja el filtro" className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]">
              <span className="sr-only">filtrado</span>
            </span>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </AccionesDeLaVista>
    </>
  );
}
