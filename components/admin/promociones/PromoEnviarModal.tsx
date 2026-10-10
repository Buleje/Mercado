"use client";

import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X, Search, Send } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";
import { applyStoreName } from "@/components/admin/promociones/promociones-compartido";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

/** Ventana «Enviar por WhatsApp». Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function PromoEnviarModal({ prm }: { prm: Promociones }) {
  const {
    storeName, customers, sendPromo, sendPhones, setSendPhones, sendSearch, setSendSearch,
    sendModalRef, sendTitleId, closeSendModal, ventanaSend, sendWhatsApp, sendToAll,
    filteredSendCustomers,
  } = prm;
  return (
    <>
      {/* ── WhatsApp Send Modal ───────────────────────────────────────────── */}
      {sendPromo && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/50" style={{ zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget && !ventanaSend.fijado) closeSendModal(); }}>
          <div ref={sendModalRef} role="dialog" aria-modal="true" aria-labelledby={sendTitleId} tabIndex={-1} className="relative bg-[var(--surface-raised)] rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div {...ventanaSend.asaProps} className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <div>
                <CardTitle id={sendTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Enviar por WhatsApp</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{sendPromo.name}</p>
              </div>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaSend} />
              </span>
              <button aria-label="Quitar" onClick={closeSendModal} className="p-1.5 rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--rule-soft)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Message preview */}
            <div className="px-5 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-1">Vista previa del mensaje</p>
              <div className="bg-primary/10 rounded-xl p-3 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] whitespace-pre-wrap border border-[var(--data-success-500)]/30 max-h-24 overflow-y-auto">
                {applyStoreName(sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: ${formatCurrency(sendPromo.minPurchase)}` : ""}\n\n¡Te esperamos en {TIENDA}! 🛒`, storeName)}
              </div>
            </div>
            {/* Customer selection */}
            <div className="px-5 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0 flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted pointer-events-none" />
                <input type="text" placeholder="Buscar cliente…" value={sendSearch} onChange={e => setSendSearch(e.target.value)}
                  className="w-full pl-9 pr-3 h-10 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary" />
              </div>
              <button onClick={() => setSendPhones(new Set(customers.map(c => c.phone)))}
                className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">Todos</button>
              <button onClick={() => setSendPhones(new Set())}
                className="text-xs font-semibold text-[var(--text-tertiary)] dark:text-muted hover:underline whitespace-nowrap">Ninguno</button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-[var(--rule-soft)]">
              {filteredSendCustomers.map(c => {
                const selected = sendPhones.has(c.phone);
                return (
                  <div key={c.phone} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-[var(--surface-sunken)] ">
                    <input type="checkbox" checked={selected}
                      onChange={() => {
                        setSendPhones(prev => {
                          const next = new Set(prev);
                          if (next.has(c.phone)) next.delete(c.phone); else next.add(c.phone);
                          return next;
                        });
                      }}
                      aria-label={`Seleccionar ${c.name}`}
                      className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{c.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">{c.phone}</p>
                    </div>
                    <button
                      onClick={() => {
                        const rawMsg = sendPromo.message || `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: ${formatCurrency(sendPromo.minPurchase)}` : ""}\n\n¡Te esperamos en {TIENDA}! 🛒`;
                        sendWhatsApp(c.phone, applyStoreName(rawMsg, storeName));
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 transition-colors flex items-center gap-1"
                    >
                      <Send className="h-3 w-3" /> Enviar
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-3">{sendPhones.size} cliente{sendPhones.size !== 1 ? "s" : ""} seleccionado{sendPhones.size !== 1 ? "s" : ""}. Cada envío abrirá WhatsApp Web/App.</p>
              <button
                onClick={sendToAll}
                disabled={sendPhones.size === 0}
                className="w-full min-h-11 rounded-xl text-sm font-semibold text-white bg-primary/10 hover:bg-primary/10 disabled:opacity-50 transition-colors flex flex-wrap items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" /> Enviar a todos los seleccionados
              </button>
            </div>
            <TiradorDeVentana ventana={ventanaSend} />
          </div>
        </div>
      )}
    </>
  );
}
