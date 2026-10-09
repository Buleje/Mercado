"use client";

import { CardTitle } from "@buleje/design-system";
import { m, AnimatePresence } from "@/components/admin/providers";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { X, Copy, Trash2, Send, History, MessageCircle, FileDown, Activity, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { STATUS_META, getDocIcon } from "@/components/admin/notas-credito/nc-compartido";
import { StatusTimeline } from "@/components/admin/notas-credito/NcPiezas";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Panel lateral con el detalle de una nota. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcDetalle({ nc }: { nc: NotasCreditoVista }) {
  const {
    selected, setSelected, detailTitleId, detailPanelRef, handleDuplicate, handleEmitSunat,
    handleAnular, exportPDF, sendWhatsApp, kpis, impactoVentas, clienteHistorial,
  } = nc;
  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── Detail Side Panel ─────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div key="nc-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" style={{ zIndex: 40 }} onClick={() => setSelected(null)} />
            <m.div key="nc-panel" ref={detailPanelRef} role="dialog" aria-modal="true" aria-labelledby={detailTitleId} tabIndex={-1} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[var(--surface-raised)] border-l border-[var(--rule-base)] overflow-y-auto">
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle id={detailTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                      <span className="text-xl">{getDocIcon(selected.numero)}</span>
                      NC {selected.numero}
                    </CardTitle>
                    <p className="text-xs text-[var(--text-tertiary)]">Creada {formatDateTime(selected.createdAt)}</p>
                  </div>
                  <button aria-label="Cerrar" onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors">
                    <X className="h-5 w-5 text-[var(--text-secondary)]" />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("px-3 py-1.5 rounded-xl text-xs font-bold", STATUS_META[selected.status].bg, STATUS_META[selected.status].color)}>
                    {STATUS_META[selected.status].label}
                  </span>
                  {selected.orderNumero && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[length:var(--ts-2xs)] font-bold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      {"\u{1F517}"} Vinculada a {selected.orderNumero}
                    </span>
                  )}
                  <div className="flex-1" />
                  {selected.status === "BORRADOR" && (
                    <button onClick={() => handleEmitSunat(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-white hover:bg-primary/10 transition-colors">
                      <Send className="h-3.5 w-3.5" />Emitir a SUNAT
                    </button>
                  )}
                  {selected.status !== "ANULADA" && (
                    <button onClick={() => handleAnular(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--data-error-50)] text-[var(--data-error-500)] hover:bg-[var(--data-error-100)] transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />Anular
                    </button>
                  )}
                  <button onClick={() => handleDuplicate(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] transition-colors">
                    <Copy className="h-3.5 w-3.5" />Duplicar
                  </button>
                  <button onClick={() => sendWhatsApp(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-primary/10 transition-colors" title="Enviar por WhatsApp">
                    <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                  </button>
                  <button onClick={() => exportPDF(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-primary/10 transition-colors" title="Descargar PDF">
                    <FileDown className="h-3.5 w-3.5" />PDF
                  </button>
                </div>

                <div className="bg-[var(--surface-alt)] rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-[var(--text-primary)]">[{selected.motivoCodigo}] {selected.motivoDesc}</p>
                  {selected.clienteNombre && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span>Cliente: <strong className="text-[var(--text-primary)]">{selected.clienteNombre}</strong></span>
                      {selected.clienteDocumento && <span className="text-[var(--text-tertiary)]">({selected.clienteDocumento})</span>}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--rule-base)]">
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Monto</p><p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selected.monto)}</p></div>
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">IGV</p><p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selected.igv)}</p></div>
                    <div><p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Total</p><p className="text-sm font-bold text-[var(--data-error-500)]">{formatCurrency(selected.total)}</p></div>
                  </div>
                </div>

                {selected.items && selected.items.length > 0 && (
                  <div className="bg-[var(--surface-alt)] rounded-xl p-4">
                    <p className="text-xs font-bold text-[var(--text-primary)] mb-2">Items</p>
                    <div className="space-y-1.5">
                      {selected.items.map((it, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text-secondary)]">{it.nombre} x{it.cantidad}</span>
                          <span className="font-bold text-[var(--text-primary)]">{formatCurrency(it.cantidad * it.precio)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-[var(--surface-alt)] rounded-xl p-4">
                  <p className="text-xs font-bold text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />Historial
                  </p>
                  <StatusTimeline nc={selected} />
                </div>

                {selected.notas && (
                  <div className="bg-[var(--surface-alt)] rounded-xl p-4">
                    <p className="text-xs font-bold text-[var(--text-primary)] mb-1">Notas</p>
                    <p className="text-sm text-[var(--text-secondary)]">{selected.notas}</p>
                  </div>
                )}

                {/* ── Impacto en ventas ───────────────────────────────── */}
                {impactoVentas !== null && (
                  <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-xl p-4">
                    <p className="text-xs font-bold text-[var(--data-warning-500)] mb-1 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" />Impacto en devoluciones del mes
                    </p>
                    <p className="text-sm text-[var(--data-warning-500)]">
                      Esta NC representa el <strong>{impactoVentas.toFixed(1)}%</strong> del total devuelto este mes (<strong>{formatCurrency(kpis.total)}</strong>)
                    </p>
                    <div className="mt-2 h-2 bg-[var(--data-warning-100)] rounded-full overflow-hidden">
                      <m.div className="h-full bg-[var(--data-warning-500)] rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, impactoVentas)}%` }} transition={{ duration: 0.6 }} />
                    </div>
                  </div>
                )}

                {/* ── Historial del cliente ───────────────────────────── */}
                {selected.clienteNombre && (
                  <div className="bg-[var(--surface-alt)] rounded-xl p-4">
                    <p className="text-xs font-bold text-[var(--text-primary)] mb-1.5 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />Historial de {selected.clienteNombre}
                    </p>
                    {clienteHistorial === 0 ? (
                      <p className="text-xs text-[var(--text-tertiary)]">Primera nota de crédito de este cliente</p>
                    ) : (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Este cliente tiene <strong className="text-[var(--text-primary)]">{clienteHistorial}</strong> nota{clienteHistorial !== 1 ? "s" : ""} de crédito anteriore{clienteHistorial !== 1 ? "s" : ""}
                        {clienteHistorial >= 3 && <span className="ml-1 text-[var(--data-warning-500)] font-semibold">{"\u26a0\ufe0f"} Cliente con múltiples devoluciones</span>}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
