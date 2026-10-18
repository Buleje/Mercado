"use client";

/**
 * LothTraceFiltros — cómo se busca un árbol entre cientos, pegado a la lista.
 *
 * Antes era una banda de tres filas separada de la lista: buscador, especie y
 * orden; fechas, modo, «Umbrales» y «Exportar»; y diez chips de estado — 16
 * controles antes del primer árbol. Ahora:
 *
 *   · la cabecera de la lista (título, cuántos, orden, modo y «Opciones») va
 *     en UNA fila: lo de todos los días a la vista, lo mensual (umbrales, CSV)
 *     en el menú;
 *   · los filtros van en la cabecera de cada columna (Brandon 07-10: «quitar
 *     los filtros que están sueltos»): el buscador, Estado, Especie y Fechas
 *     de la fila que vivía acá son ahora los de Árbol, Observaciones, Especie
 *     y Última (`loth-trace-filtros`); en tarjetas, los mismos controles van
 *     en «Filtros por columna»;
 *   · y las pastillas sólo existen para lo que PIDE trabajo y está en más de
 *     cero: son atajos al filtro de la columna Observaciones. Una pastilla
 *     filtra; volver a tocarla quita el filtro.
 */

import { ArrowUpDown, Download, LayoutGrid, Rows3, SlidersHorizontal, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { AccionesDeLaVista, CLASE_TEXTO_ACCION, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { FILTROS_ESTADO, ORDEN_LABEL, type TraceFiltro, type TraceModo, type TraceOrden } from "./loth-trace-ui";
import { formatNumber } from "@/lib/format";
import { BotonesColumnas } from "./loth-seccion-columnas";

const CAMPO =
  "flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]";
const SELECT = "min-w-0 bg-transparent font-bold text-[var(--text-primary)] outline-none";

/**
 * Título de la lista + cuántos + orden, modo y opciones — una sola fila.
 * Dentro del libro (17-10, «compactar el Libro TH») los controles se van al
 * riel de vistas y acá queda sólo «Árboles N»: la lista arranca una fila antes.
 */
export function LothTraceListaCabecera({
  tituloId,
  visibles,
  total,
  pagina,
  totalPaginas,
  orden,
  onOrden,
  modo,
  onModo,
  opciones,
}: {
  tituloId: string;
  visibles: number;
  total: number;
  pagina: number;
  totalPaginas: number;
  orden: TraceOrden;
  onOrden: (v: TraceOrden) => void;
  modo: TraceModo;
  onModo: (v: TraceModo) => void;
  opciones: MenuAccion[];
}) {
  const enLibro = useEnElLibro();
  const titulo = (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <CardTitle className="text-sm font-bold" id={tituloId}>Árboles</CardTitle>
      <span className="text-sm tabular-nums text-[var(--text-tertiary)]" data-contador>
        {visibles === total ? `${formatNumber(total)}` : `${formatNumber(visibles)} de ${formatNumber(total)}`}
        {totalPaginas > 1 && ` · página ${pagina + 1} de ${totalPaginas}`}
      </span>
    </div>
  );
  const alto = enLibro ? "h-12" : "h-10";
  const controles = (
    <>
      <label className={`${CAMPO} ${alto} rounded-xl`} title="Ordenar la lista">
        <ArrowUpDown className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className={`shrink-0 text-[var(--text-tertiary)] ${enLibro ? "sr-only" : ""}`}>Ordenar</span>
        <select value={orden} onChange={(e) => onOrden(e.target.value as TraceOrden)} className={SELECT}>
          {(Object.keys(ORDEN_LABEL) as TraceOrden[]).map((o) => (
            <option key={o} value={o}>
              {ORDEN_LABEL[o]}
            </option>
          ))}
        </select>
      </label>
      <div
        role="group"
        aria-label="Cómo ver la lista"
        className={`flex ${alto} items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1`}
      >
        <ModoBtn activo={modo === "tarjetas"} onClick={() => onModo("tarjetas")} icon={<LayoutGrid className="h-4 w-4" aria-hidden="true" />} label="Tarjetas" enLibro={enLibro} />
        <ModoBtn activo={modo === "tabla"} onClick={() => onModo("tabla")} icon={<Rows3 className="h-4 w-4" aria-hidden="true" />} label="Tabla" enLibro={enLibro} />
      </div>
      {/* Las columnas son de la tabla: en tarjetas no hay qué elegir. */}
      {modo === "tabla" && <BotonesColumnas className={`${alto} rounded-xl`} />}
      <ActionMenu
        label="Opciones"
        title="Umbrales de merma, descargar y limpiar filtros"
        actions={opciones}
        size="md"
        compactoEnMovil={!enLibro}
        soloIcono={enLibro}
      />
    </>
  );
  if (enLibro) {
    return (
      <>
        {titulo}
        <AccionesDeLaVista fueraDelLibro={null}>{controles}</AccionesDeLaVista>
      </>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {titulo}
      <div className="ml-auto flex flex-wrap items-center gap-2">{controles}</div>
    </div>
  );
}

/** Las pastillas de lo pendiente (atajos al filtro de Observaciones) y «Quitar filtros». */
export default function LothTraceFiltros({
  activos,
  onAlternar,
  conteos,
  hayFiltros,
  onLimpiar,
}: {
  /** Los estados elegidos en la columna Observaciones. */
  activos: readonly TraceFiltro[];
  onAlternar: (v: TraceFiltro) => void;
  /** Cuántos árboles tiene cada estado con los DEMÁS filtros puestos. */
  conteos: Record<TraceFiltro, number>;
  hayFiltros: boolean;
  onLimpiar: () => void;
}) {
  const pendientes = FILTROS_ESTADO.filter((e) => e.deuda && conteos[e.key] > 0);
  if (pendientes.length === 0 && !hayFiltros) return null;
  return (
    <div className="space-y-2">
      {(pendientes.length > 0 || hayFiltros) && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Lo que pide revisión">
          {pendientes.map((e) => {
            const activo = activos.includes(e.key);
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => onAlternar(e.key)}
                aria-pressed={activo}
                title={activo ? "Quitar este filtro" : `Ver sólo los árboles: ${e.label.toLowerCase()}`}
                className={`inline-flex h-12 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold transition-colors ${
                  activo
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--text-primary)] dark:bg-[var(--accent)]/12"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--rule-strong)]"
                }`}
              >
                {/* El color es una marca, no el texto: `--data-warning-700` sobre blanco da 3,7:1. */}
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${e.deuda === "error" ? "bg-[var(--data-error-500)]" : "bg-[var(--data-warning-500)]"}`}
                  aria-hidden="true"
                />
                {e.label}
                <span className="tabular-nums text-[var(--text-secondary)]">{formatNumber(conteos[e.key])}</span>
              </button>
            );
          })}
          {hayFiltros && (
            <button
              type="button"
              onClick={onLimpiar}
              className="inline-flex h-12 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Quitar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Opciones del menú: lo que se hace de vez en cuando. */
export function opcionesDeLaLista({
  onUmbrales,
  onExportar,
  visibles,
}: {
  onUmbrales: () => void;
  onExportar: () => void;
  visibles: number;
}): MenuAccion[] {
  return [
    {
      id: "umbrales",
      label: "Umbrales de merma",
      hint: "A partir de cuánta merma se avisa, por especie",
      icon: SlidersHorizontal,
      onSelect: onUmbrales,
    },
    {
      id: "csv",
      label: "Descargar CSV (Excel)",
      hint: `Los ${formatNumber(visibles)} árboles que se ven, con censo, operación y observaciones`,
      icon: Download,
      onSelect: onExportar,
      disabled: visibles === 0,
    },
  ];
}

function ModoBtn({
  activo,
  onClick,
  icon,
  label,
  enLibro,
}: {
  activo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  /** En el riel la palabra se calla por debajo de 80rem (queda el ícono con su nombre). */
  enLibro: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={label}
      aria-label={label}
      className={`inline-flex ${enLibro ? "h-10" : "h-8"} items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors ${
        activo ? "bg-[var(--brand-ink)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
      }`}
    >
      {icon}
      <span aria-hidden="true" className={enLibro ? CLASE_TEXTO_ACCION : "max-sm:sr-only"}>{label}</span>
    </button>
  );
}
