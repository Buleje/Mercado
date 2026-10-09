"use client";

import Image from "next/image";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X, Send, Percent, Phone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CardTitle } from "@buleje/design-system";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

/** Ventana con el detalle de una promoción. Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function PromoDetalleModal({ prm }: { prm: Promociones }) {
  const {
    customers, detailPromo, setDetailPromo, detailModalRef, detailTitleId, closeDetailModal,
    ventanaDetail, openEdit, openSendModal,
  } = prm;
  return (
    <>
      {/* ── Promo Detail Modal ────────────────────────────────────────────── */}
      {detailPromo && (
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50" style={{ zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget && !ventanaDetail.fijado) closeDetailModal(); }}>
          <div ref={detailModalRef} role="dialog" aria-modal="true" aria-labelledby={detailTitleId} tabIndex={-1} className="relative bg-[var(--surface-raised)] rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div {...ventanaDetail.asaProps} className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <CardTitle id={detailTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">{detailPromo.name}</CardTitle>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaDetail} />
              </span>
              <button aria-label="Cerrar" onClick={closeDetailModal} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--rule-soft)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {detailPromo.imageUrl && (
                <div className="relative rounded-xl overflow-hidden bg-[var(--rule-soft)] dark:bg-accent h-48">
                  <Image src={detailPromo.imageUrl} alt={detailPromo.name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                  detailPromo.active ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--rule-soft)] dark:bg-accent text-[var(--text-secondary)] dark:text-muted"
                )}>{detailPromo.active ? "Activa" : "Inactiva"}</span>
                {detailPromo.discountPercent > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)]">
                    <Percent className="h-3 w-3" /> {detailPromo.discountPercent}% OFF
                  </span>
                )}
                <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                  detailPromo.targetType === "all" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : detailPromo.targetType === "group" ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                )}>{detailPromo.targetType === "all" ? "Todos los clientes" : detailPromo.targetType === "group" ? "Grupo seleccionado" : "Individual"}</span>
              </div>
              {detailPromo.description && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Descripción</p>
                  <p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-1">{detailPromo.description}</p>
                </div>
              )}
              {detailPromo.minPurchase && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Compra mínima</p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-1">{formatCurrency(detailPromo.minPurchase)}</p>
                </div>
              )}
              {detailPromo.message && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Mensaje WhatsApp</p>
                  <div className="bg-primary/10 rounded-xl p-3 mt-1 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] whitespace-pre-wrap border border-[var(--data-success-500)]/30">{detailPromo.message}</div>
                </div>
              )}
              {detailPromo.targetPhones && (
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">Clientes objetivo</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {detailPromo.targetPhones.split(",").filter(Boolean).map(ph => {
                      const cust = customers.find(c => c.phone === ph);
                      return (
                        <span key={ph} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-[var(--rule-soft)] dark:bg-accent text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">
                          <Phone className="h-3 w-3" /> {cust ? cust.name : ph}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-[var(--text-tertiary)] dark:text-muted">
                <span>ID: {detailPromo.id}</span>
                <span>Creada: {formatDate(detailPromo.createdAt)}</span>
                {detailPromo.expiresAt && <span>Expira: {formatDate(detailPromo.expiresAt)}</span>}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-3 shrink-0">
              <button
                onClick={() => { setDetailPromo(null); openSendModal(detailPromo); }}
                className="flex-1 flex flex-wrap items-center justify-center gap-2 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary/10 hover:bg-primary/10 transition-colors"
              >
                <Send className="h-4 w-4" /> Enviar por WhatsApp
              </button>
              <button
                onClick={() => { setDetailPromo(null); openEdit(detailPromo); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--rule-soft)] dark:bg-accent hover:bg-[var(--rule-base)] transition-colors"
              >
                Editar
              </button>
            </div>
            <TiradorDeVentana ventana={ventanaDetail} />
          </div>
        </div>
      )}
    </>
  );
}
