"use client";

import { X } from "@buleje/design-system/icons";
import type { Rango } from "@/lib/admin/filtros-columna";
import { FiltroColumnaMulti, FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import { STATUS_MAP, type ReceptionStatus } from "@/components/admin/ordenes-compra/recepciones/tipos";
import type { Recepciones } from "@/components/admin/ordenes-compra/recepciones/use-recepciones";
import CampoBuscar from "@/components/ui-system/CampoBuscar";
import { Button } from "@/components/ui-system/Button";

/** Los filtros de columna, a 48 px en la fila (mismo arreglo que Productos y stock). */
const FILTRO_EN_FILA = "mt-0! min-w-0 shrink-0 [&_summary]:h-12 [&_summary]:rounded-xl [&_summary]:text-sm";

/**
 * La fila de filtros de Recepciones, pegada a la tabla (10-10): buscar ·
 * proveedor · programada · estado · limpiar. Antes había pastillas de estado
 * ARRIBA (sólo 4 de los 5 estados), el buscador al costado, los mismos filtros
 * en los títulos de la tabla y otra fila igual sólo para el celular: tres
 * lugares para lo mismo. Ahora un solo lugar, igual en la compu y en el celular.
 */
export default function RecepcionesFiltros({ r }: { r: Recepciones }) {
  const {
    search, setSearch, proveedorFiltro, setProveedorFiltro, proveedorFaceta, programadaRango, setProgramadaRango,
    estadoFiltro, setEstadoFiltro, estadoFaceta, hayFiltros, limpiar, filtered, receptions,
  } = r;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CampoBuscar valor={search} onCambiar={setSearch} placeholder="Proveedor, recepción u orden" etiqueta="Buscar recepciones" className="min-w-[12rem]" />
      <FiltroColumnaMulti label="Proveedor" value={proveedorFiltro} options={proveedorFaceta} onChange={setProveedorFiltro} placeholder="Proveedor" className={FILTRO_EN_FILA} />
      <FiltroColumnaRango
        label="Programada"
        esFecha
        placeholder="Programada"
        valor={programadaRango}
        onChange={(v) => setProgramadaRango(v as Rango<string>)}
        className={FILTRO_EN_FILA}
      />
      <FiltroColumnaMulti
        label="Estado"
        value={estadoFiltro}
        options={estadoFaceta}
        etiqueta={(v) => STATUS_MAP[v as ReceptionStatus]?.label ?? v}
        onChange={(v) => setEstadoFiltro(v as ReceptionStatus[])}
        placeholder="Estado"
        className={FILTRO_EN_FILA}
      />
      {hayFiltros && (
        <Button variant="ghost" onClick={limpiar} className="gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)]">
          <X className="h-4 w-4" aria-hidden /> Limpiar
          <span className="sr-only">filtros: {filtered.length} de {receptions.length} recepciones</span>
        </Button>
      )}
    </div>
  );
}
