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
 *   · los filtros van en otra, todos iguales, con el estado en un desplegable
 *     que cuenta cada opción (como «Estado» en Secciones);
 *   · y las pastillas sólo existen para lo que PIDE trabajo y está en más de
 *     cero. Una pastilla filtra; volver a tocarla quita el filtro.
 */

import { Download, LayoutGrid, Rows3, Search, SlidersHorizontal, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { OpcionEspecie } from "./hooks/use-loth-trace-vista";
import { FILTROS_ESTADO, ORDEN_LABEL, type TraceFiltro, type TraceModo, type TraceOrden } from "./loth-trace-ui";
import { formatNumber } from "@/lib/format";

const CAMPO =
  "flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]";
const SELECT = "min-w-0 bg-transparent font-bold text-[var(--text-primary)] outline-none";

/** Título de la lista + cuántos + orden, modo y opciones — una sola fila. */
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
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <CardTitle id={tituloId}>Árboles</CardTitle>
        <span className="text-sm tabular-nums text-[var(--text-tertiary)]" data-contador>
          {visibles === total ? `${formatNumber(total)}` : `${formatNumber(visibles)} de ${formatNumber(total)}`}
          {totalPaginas > 1 && ` · página ${pagina + 1} de ${totalPaginas}`}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className={`${CAMPO} h-10 rounded-xl`}>
          <span className="shrink-0 text-[var(--text-tertiary)]">Ordenar</span>
          <select value={orden} onChange={(e) => onOrden(e.target.value as TraceOrden)} className={SELECT}>
            {(Object.keys(ORDEN_LABEL) as TraceOrden[]).map((o) => (
              <option key={o} value={o}>
                {ORDEN_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Cómo ver la lista" className="flex h-10 items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
          <ModoBtn activo={modo === "tarjetas"} onClick={() => onModo("tarjetas")} icon={<LayoutGrid className="h-4 w-4" aria-hidden="true" />} label="Tarjetas" />
          <ModoBtn activo={modo === "tabla"} onClick={() => onModo("tabla")} icon={<Rows3 className="h-4 w-4" aria-hidden="true" />} label="Tabla" />
        </div>
        <ActionMenu label="Opciones" title="Umbrales de merma, descargar y limpiar filtros" actions={opciones} size="sm" compactoEnMovil />
      </div>
    </div>
  );
}

/** Buscar, estado, especie y fechas en una fila; debajo, las pastillas de lo pendiente. */
export default function LothTraceFiltros({
  search,
  onSearch,
  filtro,
  onFiltro,
  conteos,
  especie,
  onEspecie,
  especies,
  desde,
  hasta,
  onDesde,
  onHasta,
  hayFiltros,
  onLimpiar,
}: {
  search: string;
  onSearch: (v: string) => void;
  filtro: TraceFiltro;
  onFiltro: (v: TraceFiltro) => void;
  /** Cuántos árboles tiene cada estado con los DEMÁS filtros puestos. */
  conteos: Record<TraceFiltro, number>;
  especie: string;
  onEspecie: (v: string) => void;
  especies: OpcionEspecie[];
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  hayFiltros: boolean;
  onLimpiar: () => void;
}) {
  const pendientes = FILTROS_ESTADO.filter((e) => e.deuda && conteos[e.key] > 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${CAMPO} min-w-0 flex-1 basis-[14rem] px-4 max-sm:basis-full`}>
          <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="sr-only">Buscar un árbol</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Árbol, especie, troza o N° de GTF"
            className="w-full min-w-0 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
        </label>
        <label className={`${CAMPO} max-sm:flex-1`}>
          <span className="shrink-0 text-[var(--text-tertiary)]">Estado</span>
          <select value={filtro} onChange={(e) => onFiltro(e.target.value as TraceFiltro)} className={`${SELECT} max-w-[12rem]`}>
            {FILTROS_ESTADO.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label} ({formatNumber(conteos[e.key])})
              </option>
            ))}
          </select>
        </label>
        {/* Un desplegable con una sola opción no filtra nada: no se dibuja. */}
        {especies.length > 1 && (
          <label className={`${CAMPO} max-sm:flex-1`}>
            <span className="shrink-0 text-[var(--text-tertiary)]">Especie</span>
            <select value={especie} onChange={(e) => onEspecie(e.target.value)} className={`${SELECT} max-w-[10rem]`}>
              <option value="">Todas</option>
              {especies.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.label} ({formatNumber(e.count)})
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className={`${CAMPO} max-sm:basis-full`}>
          <legend className="sr-only">Rango de fechas</legend>
          <span className="shrink-0 text-[var(--text-tertiary)]">Fechas</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => onDesde(e.target.value)}
            aria-label="Desde"
            className={`${SELECT} w-[8.5rem] max-sm:flex-1`}
          />
          <span className="text-[var(--text-tertiary)]" aria-hidden="true">
            –
          </span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => onHasta(e.target.value)}
            aria-label="Hasta"
            className={`${SELECT} w-[8.5rem] max-sm:flex-1`}
          />
        </fieldset>
      </div>

      {(pendientes.length > 0 || hayFiltros) && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Lo que pide revisión">
          {pendientes.map((e) => {
            const activo = filtro === e.key;
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => onFiltro(activo ? "todas" : e.key)}
                aria-pressed={activo}
                title={activo ? "Quitar este filtro" : `Ver sólo los árboles: ${e.label.toLowerCase()}`}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold transition-colors ${
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
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
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

function ModoBtn({ activo, onClick, icon, label }: { activo: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={label}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors ${
        activo ? "bg-[var(--brand-ink)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
      }`}
    >
      {icon}
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}
