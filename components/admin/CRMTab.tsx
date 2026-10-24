"use client";

import { DataTable, LoadingState } from "@buleje/design-system";
import { AlertCircle } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import { m, AnimatePresence } from "@/components/admin/providers";
import Customer360Tab from "@/components/admin/Customer360Tab";
import ClienteFormModal from "@/components/admin/clientes/ClienteFormModal";
import { useCrm } from "@/components/admin/crm/use-crm";
import { useIndicadoresCrm } from "@/components/admin/crm/CrmIndicadores";
import CrmCabecera from "@/components/admin/crm/CrmCabecera";
import CrmFiltros from "@/components/admin/crm/CrmFiltros";
import CrmFilas from "@/components/admin/crm/CrmFilas";
import CrmPaginacion from "@/components/admin/crm/CrmPaginacion";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import CrmComparar from "@/components/admin/crm/CrmComparar";

export { inferSegment } from "@/components/admin/crm/crm-compartido";
export type { Customer, Segment } from "@/components/admin/crm/crm-compartido";

export default function CRMTab() {
  // El estado vive en `useCrm` (crm/use-crm.ts); cada bloque de la vista, en su pieza de `crm/`.
  // Partido el 09-10 sin cambiar el DOM.
  const crm = useCrm();
  const {
    customers, loading, error, detail, setDetail, showNewClientModal, setShowNewClientModal, load,
  } = crm;
  // Indicadores plegables (patrón del panel): cerrados por defecto, el botón en la cabecera, el panel debajo.
  const indicadores = useIndicadoresCrm(crm);

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingState message="Cargando clientes…" />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-[var(--data-error-500)]" />
        <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Error al cargar clientes</p>
        <button onClick={load} className="text-sm text-primary hover:underline">Reintentar</button>
      </div>
    );
  }

  // ── Empty state — sin clientes ───────────────────────────────────────────

  // El alta de cliente se monta acá también: el botón del vacío la abre sin salir de la pantalla.
  const modalNuevoCliente = (
    <ClienteFormModal
      isOpen={showNewClientModal}
      onClose={() => setShowNewClientModal(false)}
      onSaved={() => { setShowNewClientModal(false); load(); }}
    />
  );

  if (customers.length === 0) {
    return (
      <>
        <EmptyState
          illustration="customers"
          title="Sin clientes"
          description="Tus clientes aparecerán aquí cuando hagan su primera compra."
          action={{ label: "Agregar cliente", onClick: () => setShowNewClientModal(true) }}
        />
        {modalNuevoCliente}
      </>
    );
  }

  // ── Customer360 modal ─────────────────────────────────────────────────────

  if (detail) {
    return (
      <AnimatePresence>
        <m.div
          key="360"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
        >
          <Customer360Tab phone={detail} onClose={() => setDetail(null)} />
        </m.div>
      </AnimatePresence>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <CrmCabecera crm={crm} indicadores={indicadores.boton} />

      {indicadores.panel}

      <div className="space-y-2">
        <CrmFiltros crm={crm} />
        {/* La tabla de clientes: cabecera ordenable (arrastrar columnas), filas y paginación. */}
        <div className="bg-[var(--surface-raised)] rounded-xl overflow-hidden">
          <DataTable stickyHeader className="min-w-[600px]">
            <thead ref={crm.orden.refCabecera}>
              <tr>
                {crm.compareMode && <th className="w-10"><span className="sr-only">Comparar</span></th>}
                <EnOrden
                  orden={crm.orden.orden}
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
              {crm.paginated.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--text-secondary)]">
                    {crm.hayFiltros ? "Ningún cliente con estos filtros." : "Sin clientes."}
                  </td>
                </tr>
              )}
              <CrmFilas crm={crm} />
            </tbody>
          </DataTable>
          <CrmPaginacion crm={crm} />
        </div>
      </div>

      <CrmComparar crm={crm} />

      {/* New client modal */}
      {modalNuevoCliente}
    </div>
  );
}
