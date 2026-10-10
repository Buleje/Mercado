"use client";

/**
 * Ficha lateral de un fiado (Detalle · Pagos · Acciones). Salió de
 * FiadosModule. «Cobrar» queda arriba, a la vista (la acción principal); el
 * resto sigue en la pestaña Acciones. El recordatorio por WhatsApp usa las
 * plantillas de Cobranza y queda anotado en la bitácora.
 */
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { Calendar, DollarSign, Loader2, Maximize2, MessageCircle, Minimize2, PenTool, Printer, Share2, User, X } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { waLink } from "@/lib/whatsapp-link";
import { formatCurrency, formatDate, formatDateNumeric, formatTime } from "@/lib/format";
import { tenantCacheKey } from "@/lib/tenant-cache";
import { FiadoStreakBadge } from "./FiadoBadges";
import { diasDeAtraso, recordarPorWhatsApp } from "./recordar";
import { STATUS_META, estaAbierto, type Fiado } from "./tipos";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";

type Props = {
  selected: Fiado | null;
  onCerrar: () => void;
  fiados: Fiado[];
  detailLoading: boolean;
  onCobrar: (f: Fiado) => void;
  onCompromiso: (f: Fiado) => void;
  onRecordado: () => void;
};

export default function FiadoDetalleSheet({ selected, onCerrar, fiados, detailLoading, onCobrar, onCompromiso, onRecordado }: Props) {
  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const sheetTitleId = useId();
  // El Escape central de FiadosModule cierra la ficha: el hook sólo da foco inicial + trampa de Tab.
  useModalAccesible(sheetPanelRef, { cerrarConEscape: false, activo: !!selected });
  const [panelTab, setPanelTab] = useState<"Detalle" | "Pagos" | "Acciones">("Detalle");
  const [isPanelWide, setIsPanelWide] = useState(() => {
    try { return localStorage.getItem(tenantCacheKey("panel-width-preference")) === "wide"; } catch { return false; }
  });
  
  return (
      <AnimatePresence>
        {selected && (
          <>
            <m.div
              key="sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop"
              style={{ zIndex: 40 }}
              onClick={onCerrar}
            />
            <m.div
              key="sheet-panel"
              ref={sheetPanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              tabIndex={-1}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className={cn("fixed inset-y-0 right-0 z-50 w-full bg-[var(--surface-raised)] border-l border-[var(--rule-base)] overflow-y-auto transition-all duration-[var(--dur-base)]", isPanelWide ? "max-w-[500px]" : "max-w-md")}
            >
              <div className="p-4 sm:p-6 space-y-4">
                {/* Sheet header — UX Mejora 16: Width toggle */}
                <div className="flex items-center justify-between">
                  <CardTitle id={sheetTitleId} className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">Detalle del fiado</CardTitle>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { const next = !isPanelWide; setIsPanelWide(next); try { localStorage.setItem(tenantCacheKey("panel-width-preference"), next ? "wide" : "normal"); } catch {} }}
                      className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors hidden sm:flex"
                      title={isPanelWide ? "Panel normal" : "Panel ancho"}
                    >
                      {isPanelWide ? <Minimize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> : <Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />}
                    </button>
                    <button aria-label="Cerrar" onClick={onCerrar} className="p-2 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors">
                      <X className="h-5 w-5 text-[var(--text-secondary)]" />
                    </button>
                  </div>
                </div>

                {estaAbierto(selected) && (
                  <button type="button" onClick={() => onCobrar(selected)}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark">
                    <DollarSign className="h-4 w-4" aria-hidden /> Cobrar {formatCurrency(selected.saldo)}
                  </button>
                )}

                {/* UX Mejora 15: Panel tabs */}
                <div className="flex border-b border-[var(--rule-base)]">
                  {(["Detalle", "Pagos", "Acciones"] as const).map(t => (
                    <button key={t} onClick={() => setPanelTab(t)} className={cn(
                      "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                      panelTab === t ? "border-primary text-primary" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}>{t}</button>
                  ))}
                </div>

                {/* Tab: Detalle */}
                {panelTab === "Detalle" && (
                  <>
                {/* Fiado info */}
                <div className="bg-[var(--surface-alt)] rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-bold text-[var(--text-primary)]"><EnlacePanel cosa="cliente" id={selected.customerId} className="font-bold" title="Abrir su ficha de cliente">{selected.customerName || selected.customerId}</EnlacePanel></p>
                      <p className="text-xs text-[var(--text-secondary)]">Creado: {formatDate(selected.createdAt)}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <FiadoStreakBadge customerId={selected.customerId} fiados={fiados} />
                      <StatusBadge variant={STATUS_META[selected.status].variant} label={STATUS_META[selected.status].label} icon={STATUS_META[selected.status].icon} />
                    </div>
                  </div>
                  {selected.descripcion && (
                    <p className="text-sm text-[var(--text-secondary)]">{selected.descripcion}</p>
                  )}
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--rule-base)]">
                    <div>
                      <p className="text-xs uppercase font-bold text-[var(--text-tertiary)]">Total</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selected.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase font-bold text-[var(--text-tertiary)]">Pagado</p>
                      <p className="text-sm font-bold text-[var(--data-success-500)]">{formatCurrency(selected.total - selected.saldo)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase font-bold text-[var(--text-tertiary)]">Saldo</p>
                      <p className="text-sm font-bold text-[var(--data-error-500)]">{formatCurrency(selected.saldo)}</p>
                    </div>
                  </div>
                  {selected.fechaVence && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Calendar className="h-3.5 w-3.5" />
                      Vence: {formatDate(selected.fechaVence)}
                    </div>
                  )}
                </div>
                  </>
                )}

                {/* Tab: Pagos */}
                {panelTab === "Pagos" && (
                  <>
                {/* Mejora 15: Historial de pagos mejorado con timeline */}
                <div>
                  <BlockTitle className="mb-3">Historial de pagos</BlockTitle>
                  {detailLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : selected.cuotas.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)] text-center py-4">Todavía no hay pagos</p>
                  ) : (
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-primary/10" />
                      <div className="space-y-3">
                        {[...selected.cuotas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(c => (
                          <div key={c.id} className="flex items-start gap-3 relative">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 z-10 border-2 border-[var(--surface-raised)]">
                              <DollarSign className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                            </div>
                            <div className="flex-1 min-w-0 bg-[var(--surface-alt)] rounded-xl p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(c.monto)}</p>
                                <StatusBadge variant="success" label="Pagado" size="sm" />
                              </div>
                              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                                {formatDateNumeric(c.createdAt)}
                                {" "}
                                {formatTime(c.createdAt)}
                              </p>
                              {c.notas && (
                                <p className="text-xs text-[var(--text-secondary)] mt-1 italic">{c.notas}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                  </>
                )}

                {/* Tab: Acciones */}
                {panelTab === "Acciones" && (
                  <div className="space-y-3">
                    {estaAbierto(selected) && (
                      <>
                        <button
                          type="button"
                          onClick={() => onCobrar(selected)}
                          className="w-full flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark  transition-colors"
                        >
                          <DollarSign className="h-4 w-4" />
                          Registrar pago
                        </button>
                        <button
                          onClick={() => onCompromiso(selected)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 min-h-11 rounded-xl text-sm font-semibold text-primary border-2 border-primary hover:bg-primary hover:text-white transition-colors"
                        >
                          <PenTool className="h-4 w-4" />
                          Compromiso de pago
                        </button>
                        <button
                          type="button"
                          onClick={() => recordarPorWhatsApp({ telefono: selected.customerId, nombre: selected.customerName || selected.customerId, saldo: selected.saldo, dias: diasDeAtraso(selected) }, onRecordado)}
                          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary/12 px-4 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Recordar por WhatsApp
                        </button>
                        <button
                          onClick={async () => {
                            // Genera el link público firmado del estado de cuenta
                            // consolidado y lo comparte por WhatsApp (Brandon 2026-06-17).
                            try {
                              const res = await fetch("/api/fiados/statement-link", {
                                method: "POST",
                                headers: csrfHeaders({ "Content-Type": "application/json" }),
                                body: JSON.stringify({ customerId: selected.customerId }),
                              });
                              if (!res.ok) { toast.error("No se pudo generar el link"); return; }
                              const { url } = (await res.json()) as { url: string };
                              const msg = `Hola ${selected.customerName || ""}, aquí puedes ver tu estado de cuenta completo: ${url}`;
                              const wa = waLink(selected.customerId, msg);
                              if (wa) window.open(wa, "_blank", "noopener");
                            } catch {
                              toast.error("Error al generar el link");
                            }
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-3 min-h-11 rounded-xl text-sm font-semibold text-primary border-2 border-primary hover:bg-primary hover:text-white transition-colors"
                        >
                          <Share2 className="h-4 w-4" />
                          Compartir estado de cuenta
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => window.print()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors"
                    >
                      <Printer className="h-4 w-4" />
                      Imprimir
                    </button>
                  </div>
                )}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
  );
}
