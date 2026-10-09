"use client";

import { DataTable } from "@buleje/design-system";
import { Users } from "@buleje/design-system/icons";
import type { FacetaOpcion, Rango } from "@/lib/admin/filtros-columna";
import { FiltroColumnaMulti, FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { SEGMENT_CONFIG, type Segment } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";
import CrmFilas from "@/components/admin/crm/CrmFilas";
import CrmPaginacion from "@/components/admin/crm/CrmPaginacion";

/** Tabla de clientes con cabecera ordenable y filtros por columna. Pieza de CRMTab: recibe `useCrm` entero. */
export default function CrmTabla({ crm }: { crm: Crm }) {
  const {
    search, setSearch, actividadFiltro, setActividadFiltro, creditoRango, setCreditoRango,
    filterSegment, setFilterSegment, filterTag, setFilterTag, compareMode, orden, segmentCounts,
    quickFilterCounts, paginated,
  } = crm;
  return (
    <>
      {/* Table — UX Mejora 18: Sticky header */}
      <div className="bg-[var(--surface-raised)] rounded-xl overflow-hidden">
        <DataTable stickyHeader filtrable className="min-w-[600px]">
          <thead ref={orden.refCabecera}>
            <tr>
              {compareMode && <th className="w-10"><span className="sr-only">Seleccionar</span></th>}
              <EnOrden
                orden={orden.orden}
                celdas={{
                  rank: <th data-col="rank" className="text-center w-14">Rank</th>,
                  cliente: <th data-col="cliente">Cliente</th>,
                  telefono: <th data-col="telefono">Teléfono</th>,
                  ultimoPedido: (
                    <th data-col="ultimoPedido" className="hidden sm:table-cell">
                      <span className="block">Último pedido</span>
                      <FiltroColumnaMulti
                        label="Último pedido"
                        value={actividadFiltro}
                        options={[
                          { value: "Activo", count: quickFilterCounts.activos },
                          { value: "Inactivo", count: quickFilterCounts.inactivos },
                        ]}
                        onChange={setActividadFiltro}
                        placeholder="Todos"
                      />
                    </th>
                  ),
                  totalGastado: <th data-col="totalGastado" className="text-right hidden md:table-cell">Total gastado</th>,
                  credito: (
                    <th data-col="credito" className="hidden lg:table-cell">
                      <span className="block">Crédito</span>
                      <FiltroColumnaRango
                        label="Crédito"
                        unidad="S/"
                        paso={0.5}
                        valor={creditoRango}
                        onChange={(r) => setCreditoRango(r as Rango<number>)}
                      />
                    </th>
                  ),
                  segmento: (
                    <th data-col="segmento">
                      <span className="block">Segmento</span>
                      <FiltroColumnaMulti
                        label="Segmento"
                        value={filterSegment}
                        options={(Object.keys(SEGMENT_CONFIG) as Segment[]).map((s): FacetaOpcion => ({ value: s, count: segmentCounts[s] }))}
                        etiqueta={(v) => SEGMENT_CONFIG[v as Segment]?.label ?? v}
                        onChange={(v) => setFilterSegment(v as Segment[])}
                        placeholder="Todos"
                      />
                    </th>
                  ),
                  contacto: <th data-col="contacto" className="hidden md:table-cell">Contacto</th>,
                }}
              />
              <th className="text-center">Ver</th>
            </tr>
          </thead>
          <tbody>
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-[var(--text-tertiary)] dark:text-muted">
                      <Users className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No se encontraron clientes</p>
                      {(search || filterSegment.length > 0 || actividadFiltro.length > 0 || creditoRango.min != null || creditoRango.max != null || filterTag !== "todos") && (
                        <button onClick={() => { setSearch(""); setFilterSegment([]); setActividadFiltro([]); setCreditoRango({ min: null, max: null }); setFilterTag("todos"); }} className="text-xs text-primary hover:underline">
                          Limpiar filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              <CrmFilas crm={crm} />
          </tbody>
        </DataTable>

        <CrmPaginacion crm={crm} />
      </div>
    </>
  );
}
