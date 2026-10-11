"use client";

import { CreditCard, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { FacetaOpcion } from "@/lib/admin/filtros-columna";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { FRECUENCIAS, SEGMENT_CONFIG, type Frecuencia, type Segment } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";
import CampoBuscar from "@/components/ui-system/CampoBuscar";
import { Button } from "@/components/ui-system/Button";

/** El desplegable en la fila, a 48 px (mismo arreglo que Productos y stock y Facturas). */
const FILTRO_EN_FILA = "mt-0! min-w-0 shrink-0 [&_summary]:h-12 [&_summary]:rounded-xl [&_summary]:px-3 [&_summary]:text-sm";

/**
 * La fila de filtros de Mis clientes, pegada a la tabla (10-10): buscar,
 * Segmento, Últimos 30 días, Con deuda y Etiqueta. Antes eran tres filas de
 * pastillas (Segmento · Estado · Frecuencia) y, otra vez, autofiltros dentro
 * de las cabeceras de «Último pedido», «Crédito» y «Segmento» que escribían lo
 * mismo. «Estado: Activos / Inactivos 30d» era la misma pregunta que la
 * frecuencia (activo = compró en 30 días): queda un solo filtro.
 */
export default function CrmFiltros({ crm }: { crm: Crm }) {
  const {
    customers, search, setSearch, frecuencia, setFrecuencia, creditoRango, setCreditoRango, filterSegment,
    setFilterSegment, filterTags, setFilterTags, segmentCounts, freqCounts, tagCounts, conDeuda, filtered,
    hayFiltros, setPage,
  } = crm;
  const soloConDeuda = creditoRango.min != null && creditoRango.min > 0;
  /* Cambiar un filtro vuelve a la página 1: en la 3 con 4 resultados la tabla quedaba vacía. */
  const conPagina1 = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };
  const limpiar = () => {
    setSearch("");
    setFrecuencia([]);
    setCreditoRango({ min: null, max: null });
    setFilterSegment([]);
    setFilterTags([]);
    setPage(1);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* En celular el buscador va en su propia fila; desde sm pide 16 rem y crece. */}
      <CampoBuscar
        valor={search}
        onCambiar={(v) => { setSearch(v); setPage(1); }}
        placeholder="Buscar por nombre o celular"
        etiqueta="Buscar cliente por nombre o celular"
        limpiable
        className="grow basis-full sm:basis-64"
      />
      <FiltroColumnaMulti
        label="Segmento"
        value={filterSegment}
        options={(Object.keys(SEGMENT_CONFIG) as Segment[]).map((s): FacetaOpcion => ({ value: s, count: segmentCounts[s] }))}
        etiqueta={(v) => SEGMENT_CONFIG[v as Segment]?.label ?? v}
        onChange={conPagina1((v: string[]) => setFilterSegment(v as Segment[]))}
        placeholder="Segmento: todos"
        className={FILTRO_EN_FILA}
      />
      <FiltroColumnaMulti
        label="Compras en los últimos 30 días"
        value={frecuencia}
        options={FRECUENCIAS.map((f): FacetaOpcion => ({ value: f.id, count: freqCounts[f.id] }))}
        etiqueta={(v) => FRECUENCIAS.find(f => f.id === v)?.label ?? v}
        onChange={conPagina1((v: string[]) => setFrecuencia(v as Frecuencia[]))}
        placeholder="Últimos 30 días: todos"
        className={FILTRO_EN_FILA}
      />
      <Button
        variant="secondary"
        aria-pressed={soloConDeuda}
        onClick={() => { setCreditoRango(soloConDeuda ? { min: null, max: null } : { min: 0.01, max: null }); setPage(1); }}
        title="Sólo los que deben fiados (activos o vencidos)"
        className={cn(
          "shrink-0 gap-1.5 rounded-xl px-3 text-sm",
          soloConDeuda ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]",
        )}
      >
        <CreditCard className="h-4 w-4" aria-hidden /> Con deuda ({conDeuda})
      </Button>
      {tagCounts.length > 0 && (
        <FiltroColumnaMulti
          label="Etiqueta"
          value={filterTags}
          options={tagCounts.map(([t, n]): FacetaOpcion => ({ value: t, count: n }))}
          onChange={conPagina1(setFilterTags)}
          placeholder="Etiqueta: todas"
          className={FILTRO_EN_FILA}
        />
      )}
      {/* Con un filtro puesto, cuántos quedan (antes «15 resultados» siempre a la vista). */}
      {hayFiltros && (
        <>
          <span className="shrink-0 text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite">
            {filtered.length} de {customers.length}
          </span>
          <Button variant="ghost" onClick={limpiar} className="shrink-0 rounded-xl px-3 text-sm text-[var(--data-error-ink)] hover:bg-[var(--data-error-500)]/10">
            <X className="h-4 w-4" aria-hidden /> Limpiar
          </Button>
        </>
      )}
    </div>
  );
}
