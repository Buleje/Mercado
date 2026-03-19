"use client";

import { useState, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Clock, XCircle, MessageCircleOff, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useReviews } from "@/contexts/reviews-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings } from "@/contexts/settings-context";
import { useScrollLock } from "@/hooks/use-scroll-lock";

const DEFAULT_WA = "51916409675";

function extractWaNumber(url?: string): string {
  if (!url) return DEFAULT_WA;
  const match = url.match(/wa\.me\/(\d+)/);
  return match?.[1] ?? DEFAULT_WA;
}

type LastOrder = { id: string; items: { name: string; qty: number; price: number }[]; total: number } | null;

export default function OrderConfirmModal() {
  const { confirmModalOpen, closeConfirmModal, clearPendingOrder, confirmFromCheckout } = useCart();
  const { openReviewModal } = useReviews();
  const { customer } = useCustomer();
  const { homepage } = useSettings();
  const WA_NUMBER = extractWaNumber(homepage.footerWhatsApp);
  useScrollLock(confirmModalOpen);

  // Load last order info — initial read from localStorage, updated by bsm:orderCreated event
  const [lastOrder, setLastOrder] = useState<LastOrder>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("bsm-last-order");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  useEffect(() => {
    const handler = () => {
      try {
        const raw = localStorage.getItem("bsm-last-order");
        setLastOrder(raw ? JSON.parse(raw) : null);
      } catch { setLastOrder(null); }
    };
    window.addEventListener("bsm:orderCreated", handler);
    return () => window.removeEventListener("bsm:orderCreated", handler);
  }, []);

  const orderId = lastOrder?.id ?? "";
  const shortId = orderId ? `#${orderId.slice(-6).toUpperCase()}` : "";
  const CONFIRM_MSG = orderId
    ? `Hola! Recibi con exito el pedido ${shortId}. Muchas gracias Bodega San Martin!`
    : "Hola! Recibi con exito el pedido. Muchas gracias Bodega San Martin!";
  const REJECT_MSG = orderId
    ? `Hola, tuve un problema con mi pedido ${shortId} y necesito asistencia.`
    : "Hola, tuve un problema con mi pedido y necesito asistencia.";

  const handleConfirm = () => {
    clearPendingOrder();
    if (!confirmFromCheckout) {
      const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(CONFIRM_MSG)}`;
      window.open(url, "_blank", "noopener");
    }
    try { localStorage.removeItem("bsm-last-order"); } catch { /* ignore */ }
    closeConfirmModal();
    const name = customer?.name ?? "Cliente";
    const loc = customer?.location ?? "Pucallpa";
    setTimeout(() => openReviewModal(name, loc), 500);
  };

  const handleReject = () => {
    clearPendingOrder();
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(REJECT_MSG)}`;
    window.open(url, "_blank", "noopener");
    try { localStorage.removeItem("bsm-last-order"); } catch { /* ignore */ }
    closeConfirmModal();
  };

  const handleNotSent = () => {
    clearPendingOrder();
    closeConfirmModal();
  };

  return (
    <AnimatePresence>
      {confirmModalOpen && (
        <>
          {/* Overlay */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeConfirmModal}
            className="fixed inset-0 bg-black/55 backdrop-blur-sm"
            style={{ zIndex: 8000 }}
          />

          {/* Modal */}
          <m.div
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 24 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
            style={{ zIndex: 8001 }}
          >
            <div className="pointer-events-auto w-full max-w-sm bg-white dark:bg-background rounded-2xl shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-label="Confirmar recepción">
              {/* Header strip */}
              <div className="px-6 py-4 flex items-center justify-between" style={{ background: "linear-gradient(90deg, #4f46e5, #6366f1, #4f46e5)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                    <Clock className="h-5 w-5 text-white" />
                  </div>
                  <p className="font-bold text-white text-base leading-tight">
                    Confirmar recepcion
                  </p>
                </div>
                <button
                  onClick={closeConfirmModal}
                  className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5 text-white/80" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-6 space-y-3">
                {/* Illustration */}
                <div className="flex justify-center">
                  <m.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/8"
                  >
                    <span className="text-4xl">📦</span>
                  </m.div>
                </div>

                <div className="text-center space-y-1.5">
                  <p className="text-lg font-bold text-foreground leading-tight">
                    ¿Ya recibiste tu pedido?
                  </p>
                  {shortId && (
                    <p className="text-xs font-bold text-primary">{shortId}</p>
                  )}
                  <p className="text-sm text-muted leading-relaxed">
                    Confirma la recepcion o reporta cualquier problema con tu pedido.
                  </p>
                </div>

                {/* Order summary */}
                {lastOrder && lastOrder.items.length > 0 && (
                  <div className="rounded-xl border border-gray-100 dark:border-card-border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-surface/50 border-b border-gray-100 dark:border-card-border">
                      <ShoppingBag className="h-3.5 w-3.5 text-muted" />
                      <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Resumen del pedido</p>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-card-border max-h-32 overflow-y-auto">
                      {lastOrder.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5">
                          <p className="text-xs text-foreground truncate flex-1 mr-2">
                            {item.name} <span className="text-muted">×{item.qty}</span>
                          </p>
                          <p className="text-xs font-semibold text-foreground shrink-0">S/{(item.price * item.qty).toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-t border-gray-100 dark:border-card-border">
                      <p className="text-xs font-bold text-foreground">Total</p>
                      <p className="text-sm font-extrabold text-primary">S/{lastOrder.total.toFixed(2)}</p>
                    </div>
                  </div>
                )}

                {/* Confirm — green */}
                <m.button
                  onClick={handleConfirm}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-5 py-3.5 text-base font-bold text-white shadow-md shadow-[#25D366]/20 hover:bg-[#1fb85a] transition-all"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Pedido recibido con exito
                </m.button>

                {/* Reject — red */}
                <m.button
                  onClick={handleReject}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-red-500 px-5 py-3.5 text-base font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-600 transition-all"
                >
                  <XCircle className="h-5 w-5" />
                  Rechazar pedido
                </m.button>

                {/* Divider */}
                <div className="border-t border-gray-100 pt-2 space-y-2">
                  {/* Not sent button — only in WhatsApp mode */}
                  {!confirmFromCheckout && (
                    <button
                      onClick={handleNotSent}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-muted hover:text-foreground hover:border-gray-300 hover:bg-gray-50 transition-all"
                    >
                      <MessageCircleOff className="h-4 w-4 shrink-0" />
                      No envie el mensaje por WhatsApp (Cerrar)
                    </button>
                  )}

                  {/* Simple close */}
                  <button
                    onClick={closeConfirmModal}
                    className="w-full text-center text-sm text-muted hover:text-foreground transition-colors py-1"
                  >
                    Cerrar — confirmare despues
                  </button>
                </div>
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
