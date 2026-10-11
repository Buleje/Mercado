"use client";

import { DataTable } from "@buleje/design-system";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import type { Crm } from "@/components/admin/crm/use-crm";
import CrmFilas from "@/components/admin/crm/CrmFilas";
import CrmPaginacion from "@/components/admin/crm/CrmPaginacion";

/**
 * Tabla de clientes con cabecera ordenable (arrastrar columnas). Sin filtros
 * dentro de las cabeceras desde el 10-10: viven en la fila de arriba
 * (CrmFiltros), que ya escribía el mismo estado. Pieza de CRMTab: recibe `useCrm` entero.
 */
export default function CrmTabla({ crm }: { crm: Crm }) {
  const { compareMode, orden, paginated, hayFiltros } = crm;
  return (
    <div className="bg-[var(--surface-raised)] rounded-xl overflow-hidden">
      <DataTable stickyHeader className="min-w-[600px]">
        <thead ref={orden.refCabecera}>
          <tr>
            {compareMode && <th className="w-10"><span className="sr-only">Comparar</span></th>}
            <EnOrden
              orden={orden.orden}
              celdas={{
                cliente: <th data-col="cliente">Cliente</th>,
                telefono: <th data-col="telefono">Celular</th>,
                ultimaCompra: <th data-col="ultimaCompra">Última compra</th>,
                totalGastado: <th data-col="totalGastado" className="text-right">Total gastado</th>,
                credito: <th data-col="credito">Crédito</th>,
                segmento: <th data-col="segmento">Segmento</th>,
              }}
            />
            <th className="w-28 text-right"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {paginated.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-[var(--text-secondary)]">
                {hayFiltros ? "Ningún cliente con estos filtros." : "Sin clientes."}
              </td>
            </tr>
          )}
          <CrmFilas crm={crm} />
        </tbody>
      </DataTable>
      <CrmPaginacion crm={crm} />
    </div>
  );
}
