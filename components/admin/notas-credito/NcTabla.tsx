"use client";

import { CardTitle, DataTable, LoadingState } from "@buleje/design-system";
import { AnimatePresence } from "@/components/admin/providers";
import { formatCurrency, formatDate } from "@/lib/format";
import { ChevronLeft, ChevronRight, AlertTriangle, Copy, Trash2, Send, FileText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { STATUS_META, getDocIcon } from "@/components/admin/notas-credito/nc-compartido";
import { NCCard } from "@/components/admin/notas-credito/NcPiezas";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Tabla y tarjetas de Notas de crédito. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcTabla({ nc }: { nc: NotasCreditoVista }) {
  const {
    loading, error, page, setPage, setSelected, checkedIds, viewMode, setShowNew,
    setWizardStep, setCreateError, fetchNotas, filteredNotas, totalPages, paginated, toggleSort,
    SortIcon, allChecked, toggleCheck, toggleAll, handleDuplicate, handleEmitSunat, handleAnular,
  } = nc;
  return (
    <>
      {/* ── Table / Cards View ─────────────────────────────────────────── */}
      {viewMode !== "kanban" && (
      <div className="bg-[var(--surface-raised)] rounded-xl overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
            <p className="text-sm text-[var(--data-error-500)]">{error}</p>
            <button onClick={fetchNotas} className="text-xs text-primary hover:underline font-semibold mt-1">Reintentar</button>
          </div>
        ) : filteredNotas.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] flex items-center justify-center">
              <FileText className="h-7 w-7 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
            </div>
            <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] mb-2">Sin notas de crédito</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">Las notas de crédito se crean al hacer devoluciones, anulaciones o ajustes a documentos existentes</p>
            <button onClick={() => { setShowNew(true); setCreateError(null); setWizardStep(0); }} className="bg-primary text-white px-6 min-h-11 rounded-xl font-medium hover:bg-primary-dark">Crear NC</button>
          </div>
        ) : viewMode === "cards" ? (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence>
              {paginated.map(nc => (
                <NCCard key={nc.id} nc={nc} onSelect={() => setSelected(nc)} selected={checkedIds.has(nc.id)} onToggle={() => toggleCheck(nc.id)} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <DataTable className="min-w-175">
                <thead>
                  <tr>
                    <th className="w-10">
                      <button onClick={toggleAll} className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                        allChecked ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
                        {allChecked && <span className="text-[length:var(--ts-2xs)]">{"\u2713"}</span>}
                      </button>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("numero")}>
                      <span className="flex items-center gap-1">Documento <SortIcon field="numero" /></span>
                    </th>
                    <th className="hidden sm:table-cell">Referencia</th>
                    <th>Motivo</th>
                    <th className="text-right cursor-pointer select-none" onClick={() => toggleSort("total")}>
                      <span className="flex items-center gap-1 justify-end">Total <SortIcon field="total" /></span>
                    </th>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                      <span className="flex items-center gap-1">Estado <SortIcon field="status" /></span>
                    </th>
                    <th className="hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                      <span className="flex items-center gap-1">Fecha <SortIcon field="createdAt" /></span>
                    </th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(nc => {
                    const meta = STATUS_META[nc.status];
                    return (
                      <tr key={nc.id} className="group">
                        <td>
                          <button onClick={() => toggleCheck(nc.id)} className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                            checkedIds.has(nc.id) ? "bg-primary border-primary text-white" : "border-[var(--rule-base)]")}>
                            {checkedIds.has(nc.id) && <span className="text-[length:var(--ts-2xs)]">{"\u2713"}</span>}
                          </button>
                        </td>
                        <td
                          className="cursor-pointer"
                          onClick={() => setSelected(nc)}
                          tabIndex={0}
                          aria-label={`Ver detalle de ${nc.numero}`}
                          onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(nc); } }}
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-base">{getDocIcon(nc.numero)}</span>
                            <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{nc.numero}</span>
                          </span>
                          {nc.clienteNombre && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{nc.clienteNombre}</p>}
                        </td>
                        <td className="hidden sm:table-cell">
                          {nc.orderNumero ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                              {"\u{1F517}"} {nc.orderNumero}
                            </span>
                          ) : <span className="text-[var(--text-tertiary)]">{"\u2014"}</span>}
                        </td>
                        <td className="text-[var(--text-primary)] truncate max-w-45">
                          <span className="text-xs text-[var(--text-tertiary)] mr-1">[{nc.motivoCodigo}]</span>
                          {nc.motivoDesc}
                        </td>
                        <td className="text-right font-bold text-[var(--text-primary)]">{formatCurrency(nc.total)}</td>
                        <td>
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", meta.bg, meta.color)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="text-[var(--text-secondary)] hidden md:table-cell text-xs">{formatDate(nc.createdAt)}</td>
                        <td>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {nc.status === "BORRADOR" && (
                              <button onClick={(e) => { e.stopPropagation(); handleEmitSunat(nc); }} className="p-1 rounded-xl hover:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" title="Emitir">
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {nc.status !== "ANULADA" && (
                              <button onClick={(e) => { e.stopPropagation(); handleAnular(nc); }} className="p-1 rounded-xl hover:bg-[var(--data-error-50)] text-[var(--data-error-500)]" title="Anular">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleDuplicate(nc); }} className="p-1 rounded-xl hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" title="Duplicar">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)]">
                <p className="text-xs text-[var(--text-secondary)]">{filteredNotas.length} doc{filteredNotas.length !== 1 ? "s" : ""} {"\u2014"} P{"\u00e1"}g. {page}/{totalPages}</p>
                <div className="flex gap-1">
                  <button aria-label="Anterior" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                  <button aria-label="Siguiente" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}
    </>
  );
}
