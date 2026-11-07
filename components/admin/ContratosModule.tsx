"use client";

import CabeceraContratos from "@/components/admin/contratos/CabeceraContratos";
import { formatMoney } from "./contratos/formato-contratos";
import { LoadingState } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";
import { AnimatePresence, m } from "@/components/admin/providers";
import VistaDashboard from "./contratos/VistaDashboard";
import VistaPlantillas from "./contratos/VistaPlantillas";
import VistaContratos from "./contratos/VistaContratos";
import VistaCrear from "./contratos/VistaCrear";
import VistaEditor from "./contratos/VistaEditor";
import PanelDetalle from "./contratos/PanelDetalle";
import { useContratos } from "./contratos/use-contratos";

/**
 * Este módulo usa `useSubvistaModulo` (`?sub=`) y no `?vista=`: se renderiza
 * DENTRO de DocumentosHubModule, que ya es dueño de ese parámetro. Dos componentes
 * escribiendo el mismo se pisarían — el de adentro le cambiaría la pestaña al
 * de afuera en cada click.
 */
export default function ContratosModule() {
  const arch = useContratos();
  const { activeTab, setActiveTab, stats, loading, fetchContratos, error, selected, setSelected, panelRef,
    panelTitleId } = arch;
  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <CabeceraContratos
        seccion={activeTab}
        irA={setActiveTab}
        cifras={stats}
        plataVigente={formatMoney(stats.montoVigente)}
        hayDolares={stats.hayDolares}
        cargando={loading}
        onActualizar={fetchContratos}
      />

      {/* Loading / Error */}
      {loading && (
        <LoadingState />
      )}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
          <button onClick={fetchContratos} className="text-xs text-primary hover:underline font-semibold">Reintentar</button>
        </div>
      )}

      {/* Tab Content */}
      {!loading && !error && (
        <AnimatePresence mode="wait">
          <m.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {/* ═══ DASHBOARD ═══ */}
            {activeTab === "dashboard" && (
              <VistaDashboard arch={arch} />
            )}

            {/* ═══ PLANTILLAS ═══ */}
            {activeTab === "plantillas" && (
              <VistaPlantillas arch={arch} />
            )}

            {/* ═══ MIS CONTRATOS ═══ */}
            {activeTab === "contratos" && (
              <VistaContratos arch={arch} />
            )}

            {/* ═══ CREAR CONTRATO (WIZARD) ═══ */}
            {activeTab === "crear" && (
              <VistaCrear arch={arch} />
            )}

            {/* ═══ EDITOR ═══ */}
            {activeTab === "editor" && (
              <VistaEditor arch={arch} />
            )}
          </m.div>
        </AnimatePresence>
      )}

      {/* ═══ CONTRACT DETAIL SHEET ═══ */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div key="ct-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" style={{ zIndex: 40 }} onClick={() => setSelected(null)} />
            <m.div
              key="ct-panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={panelTitleId}
              tabIndex={-1}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[var(--surface-raised)] border-l border-[var(--rule-base)] overflow-y-auto"
            >
              <PanelDetalle arch={arch} />
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
