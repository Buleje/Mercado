"use client";

import { useId } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { LoadingState } from "@buleje/design-system";
import { AlertCircle } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import { m, AnimatePresence } from "@/components/admin/providers";
import Customer360Tab from "@/components/admin/Customer360Tab";
import ClienteFormModal from "@/components/admin/clientes/ClienteFormModal";
import { useCrm } from "@/components/admin/crm/use-crm";
import CrmIndicadores from "@/components/admin/crm/CrmIndicadores";
import CrmBuscador from "@/components/admin/crm/CrmBuscador";
import CrmFiltros from "@/components/admin/crm/CrmFiltros";
import CrmTabla from "@/components/admin/crm/CrmTabla";
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
  // Indicadores plegables y recordados (ley de Brandon): el botón va en la cabecera, el panel arriba.
  const [indicadoresAbiertos, setIndicadoresAbiertos] = useLocalStorage<boolean>("crm:indicadores-abiertos", true);
  const panelIndicadores = useId();

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
    <div className="space-y-6">

      <CrmIndicadores crm={crm} abierto={indicadoresAbiertos} panelId={panelIndicadores} />

      <CrmBuscador
        crm={crm}
        indicadores={{ abierto: indicadoresAbiertos, alternar: () => setIndicadoresAbiertos(!indicadoresAbiertos), controla: panelIndicadores }}
      />

      <CrmFiltros crm={crm} />

      <CrmTabla crm={crm} />

      <CrmComparar crm={crm} />

      {/* New client modal */}
      {modalNuevoCliente}
    </div>
  );
}
