"use client";

import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Plus, Download, Send, CheckSquare, Keyboard, MoreHorizontal, RefreshCw } from "@buleje/design-system/icons";
import { StaleDraftsBanner } from "@/components/admin/notas-credito/NcPiezas";
import { useNotasCredito } from "@/components/admin/notas-credito/hooks/use-notas-credito";
import { useIndicadoresNc } from "@/components/admin/notas-credito/use-indicadores-nc";
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
    exportCSV, handleBulkEmit, fetchNotas,
  } = nc;
  const kpis = useIndicadoresNc(nc);
  const abrirNueva = () => { setShowNew(true); setCreateError(null); setWizardStep(0); setPickerSearch(""); setPickerDocType("all"); };
  const acciones: MenuAccion[] = [
    { id: "atajos", label: "Atajos de teclado", hint: "N nueva nota, F buscar, Esc cerrar", icon: Keyboard, activo: showShortcuts, onSelect: () => setShowShortcuts(v => !v) },
    { id: "csv", label: "Exportar a CSV", hint: `${filteredNotas.length} nota${filteredNotas.length === 1 ? "" : "s"}, con los filtros puestos`, icon: Download, onSelect: exportCSV, disabled: filteredNotas.length === 0 },
    { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: fetchNotas },
  ];

  return (
    <div className="space-y-3">
      {/* Una fila: título · Indicadores · Nueva nota · Más (patrón de Turnos y Caja). */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Notas de crédito</SectionTitle>
          <InfoTip
            title="Notas de crédito"
            what="Las notas que anulan o corrigen una boleta o factura ya emitida: devoluciones, descuentos y errores."
            affects="Una nota emitida baja lo cobrado de ese comprobante. En borrador no cuenta hasta que la emites."
            example="Doña Rosa devuelve 2 latas de leche de la boleta B001-340: haces la nota por S/ 9 y su boleta queda corregida."
            side="bottom"
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <button type="button" onClick={abrirNueva} className={button({ variant: "primary", className: "h-12 shrink-0 rounded-2xl" })}>
            <Plus className="h-4 w-4" aria-hidden />
            Nueva nota
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Atajos de teclado, exportar y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {/* ── Keyboard Shortcuts Panel ───────────────────────────────────── */}
      {showShortcuts && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 text-sm text-[var(--text-secondary)]">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-sm">N</kbd> Nueva NC</div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-sm">F</kbd> Buscar</div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-sm">Esc</kbd> Cerrar</div>
          </div>
        </div>
      )}

      {/* ── Stale Drafts Banner ────────────────────────────────────────── */}
      <StaleDraftsBanner notas={notas} onFilter={() => setStatusFilter("BORRADOR")} />

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
                <button type="button" onClick={handleBulkEmit} title="Quedan emitidas en tus registros; no se envían a SUNAT desde aquí" className={button({ variant: "primary", className: "rounded-xl" })}>
                  <Send className="h-4 w-4" aria-hidden />Marcar {filteredNotas.filter(nc => checkedIds.has(nc.id) && nc.status === "BORRADOR").length} emitidas
                </button>
              )}
              <button onClick={exportCSV} className="flex items-center gap-1.5 px-4 min-h-12 rounded-xl text-sm font-bold bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors">
                <Download className="h-3.5 w-3.5" />Exportar CSV
              </button>
              <button onClick={() => setCheckedIds(new Set())} className="min-h-12 px-3 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Deseleccionar</button>
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
