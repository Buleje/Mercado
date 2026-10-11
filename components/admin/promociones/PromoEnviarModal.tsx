"use client";

import { Search, Send } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { applyStoreName } from "@/components/admin/promociones/promociones-compartido";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

/** Ventana «Enviar por WhatsApp». Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function PromoEnviarModal({ prm }: { prm: Promociones }) {
  const {
    storeName,
    customers,
    sendPromo,
    sendPhones,
    setSendPhones,
    sendSearch,
    setSendSearch,
    closeSendModal,
    sendWhatsApp,
    sendToAll,
    filteredSendCustomers,
  } = prm;
  return (
    <>
      {/* ── WhatsApp Send Modal ───────────────────────────────────────────── */}
      {sendPromo && (
        <AdminModal
          open
          onClose={closeSendModal}
          title="Enviar por WhatsApp"
          description={sendPromo.name}
          size="lg"
          claveVentana="promociones-enviar"
          footer={
            <ModalFooter
              nota={
                <>
                  {sendPhones.size} cliente{sendPhones.size !== 1 ? "s" : ""} seleccionado
                  {sendPhones.size !== 1 ? "s" : ""}. Cada envío abrirá WhatsApp Web/App.
                </>
              }
            >
              <button
                onClick={sendToAll}
                disabled={sendPhones.size === 0}
                className={button({ variant: "primary" })}
              >
                <Send className="h-4 w-4" /> Enviar a todos los seleccionados
              </button>
            </ModalFooter>
          }
        >
          <div className="px-5 sm:px-6 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
            <p className="text-sm font-bold text-[var(--text-tertiary)] dark:text-muted mb-1">
              Vista previa del mensaje
            </p>
            <div className="bg-primary/10 rounded-xl p-3 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] whitespace-pre-wrap border border-[var(--data-success-500)]/30 max-h-24 overflow-y-auto">
              {applyStoreName(
                sendPromo.message ||
                  `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: ${formatCurrency(sendPromo.minPurchase)}` : ""}\n\n¡Te esperamos en {TIENDA}! 🛒`,
                storeName,
              )}
            </div>
          </div>
          <div className="px-5 sm:px-6 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar cliente…"
                value={sendSearch}
                onChange={(e) => setSendSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => setSendPhones(new Set(customers.map((c) => c.phone)))}
              className="text-sm font-semibold text-primary hover:underline whitespace-nowrap"
            >
              Todos
            </button>
            <button
              onClick={() => setSendPhones(new Set())}
              className="text-sm font-semibold text-[var(--text-tertiary)] dark:text-muted hover:underline whitespace-nowrap"
            >
              Ninguno
            </button>
          </div>
          <div className={`divide-y divide-[var(--rule-soft)] ${MODAL_BODY}`}>
            {filteredSendCustomers.map((c) => {
              const selected = sendPhones.has(c.phone);
              return (
                <div
                  key={c.phone}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-[var(--surface-sunken)] "
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      setSendPhones((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.phone)) next.delete(c.phone);
                        else next.add(c.phone);
                        return next;
                      });
                    }}
                    aria-label={`Seleccionar ${c.name}`}
                    className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                      {c.name}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)] dark:text-muted font-mono">
                      {c.phone}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const rawMsg =
                        sendPromo.message ||
                        `🎉 *${sendPromo.name}*\n\n${sendPromo.description}\n\n${sendPromo.discountPercent > 0 ? `📢 ${sendPromo.discountPercent}% de descuento` : ""}${sendPromo.minPurchase ? `\nCompra mínima: ${formatCurrency(sendPromo.minPurchase)}` : ""}\n\n¡Te esperamos en {TIENDA}! 🛒`;
                      sendWhatsApp(c.phone, applyStoreName(rawMsg, storeName));
                    }}
                    className="px-3 min-h-12 rounded-lg text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 hover:bg-primary/10 transition-colors flex items-center gap-1"
                  >
                    <Send className="h-3 w-3" /> Enviar
                  </button>
                </div>
              );
            })}
          </div>
        </AdminModal>
      )}
    </>
  );
}
