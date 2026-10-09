"use client";

import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Plus, FileX, Download, Send, CheckSquare, Keyboard } from "@buleje/design-system/icons";
import { StaleDraftsBanner } from "@/components/admin/notas-credito/NcPiezas";
import { useNotasCredito } from "@/components/admin/notas-credito/hooks/use-notas-credito";
import NcIndicadores from "@/components/admin/notas-credito/NcIndicadores";
import NcFiltros from "@/components/admin/notas-credito/NcFiltros";
import NcKanban from "@/components/admin/notas-credito/NcKanban";
import NcTabla from "@/components/admin/notas-credito/NcTabla";
import NcDetalle from "@/components/admin/notas-credito/NcDetalle";
import NcAsistente from "@/components/admin/notas-credito/NcAsistente";

export default function NotasCreditoModule() {
  // El estado y las acciones viven en `useNotasCredito` (notas-credito/hooks/); cada bloque de la vista,
  // en su pieza de `notas-credito/`. Partido el 09-10 sin cambiar el DOM.
  const nc = useNotasCredito();
  const {
    notas, setStatusFilter, checkedIds, setCheckedIds, showShortcuts, setShowShortcuts, setShowNew,
    setWizardStep, setCreateError, setPickerSearch, setPickerDocType, filteredNotas, someChecked,
    exportCSV, handleBulkEmit,
  } = nc;

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Documentos · Ajustes"
        title="Notas de Crédito"
        description="Centro de documentos — anulaciones, devoluciones y ajustes."
        icon={FileX}
      >
        <button onClick={() => setShowShortcuts(s => !s)} className="p-2 rounded-xl hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] transition-colors hidden sm:block" title="Atajos de teclado">
          <Keyboard className="h-4 w-4" />
        </button>
        <button onClick={() => { setShowNew(true); setCreateError(null); setWizardStep(0); setPickerSearch(""); setPickerDocType("all"); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-colors min-h-[44px]">
          <Plus className="h-4 w-4" />
          Nueva NC
        </button>
      </AdminModuleHeader>

      {/* ── Keyboard Shortcuts Panel ───────────────────────────────────── */}
      {showShortcuts && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 text-xs text-[var(--text-secondary)]">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-[length:var(--ts-2xs)]">N</kbd> Nueva NC</div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-[length:var(--ts-2xs)]">F</kbd> Buscar</div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-[length:var(--ts-2xs)]">Esc</kbd> Cerrar</div>
          </div>
        </div>
      )}

      {/* ── Stale Drafts Banner ────────────────────────────────────────── */}
      <StaleDraftsBanner notas={notas} onFilter={() => setStatusFilter("BORRADOR")} />

      <NcIndicadores nc={nc} />

      <NcFiltros nc={nc} />

      {/* ── Bulk Actions Bar ───────────────────────────────────────────── */}
      <AnimatePresence>
        {someChecked && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
              <CheckSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-primary">{checkedIds.size} seleccionado{checkedIds.size !== 1 ? "s" : ""}</span>
              <div className="flex-1" />
              {filteredNotas.filter(nc => checkedIds.has(nc.id) && nc.status === "BORRADOR").length > 0 && (
                <button onClick={handleBulkEmit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-white hover:bg-primary/10 transition-colors">
                  <Send className="h-3.5 w-3.5" />Emitir {filteredNotas.filter(nc => checkedIds.has(nc.id) && nc.status === "BORRADOR").length} NC
                </button>
              )}
              <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-alt)] transition-colors">
                <Download className="h-3.5 w-3.5" />Exportar CSV
              </button>
              <button onClick={() => setCheckedIds(new Set())} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Deseleccionar</button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <NcKanban nc={nc} />

      <NcTabla nc={nc} />

      <NcDetalle nc={nc} />

      <NcAsistente nc={nc} />
    </div>
  );
}
