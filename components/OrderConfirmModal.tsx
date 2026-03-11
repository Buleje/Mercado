"use client";

import { m, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Clock, XCircle, MessageCircleOff } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useReviews } from "@/contexts/reviews-context";
import { useCustomer } from "@/contexts/customer-context";
import { useScrollLock } from "@/hooks/use-scroll-lock";

const WA_NUMBER = "51916409675";
const CONFIRM_MSG = "Hola! Recibi con exito el pedido. Muchas gracias Bodega San Martin!";
const REJECT_MSG = "Hola, tuve un problema con mi pedido y necesito asistencia.";

export default function OrderConfirmModal() {
  const { confirmModalOpen, closeConfirmModal, clearPendingOrder, confirmFromCheckout } = useCart();
  const { openReviewModal } = useReviews();
  const { customer } = useCustomer();
  useScrollLock(confirmModalOpen);

  const handleConfirm = () => {
    clearPendingOrder();
    if (!confirmFromCheckout) {
      const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(CONFIRM_MSG)}`;
      window.open(url, "_blank", "noopener");
    }
    closeConfirmModal();
    // Open review modal after short delay
    const name = customer?.name ?? "Cliente";
    const loc = customer?.location ?? "Pucallpa";
    setTimeout(() => openReviewModal(name, loc), 500);
  };

  const handleReject = () => {
    clearPendingOrder();
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(REJECT_MSG)}`;
    window.open(url, "_blank", "noopener");
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
            <div className="pointer-events-auto w-full max-w-sm bg-white dark:bg-background rounded-2xl shadow-2xl overflow-hidden">
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
                  <p className="text-sm text-muted leading-relaxed">
                    Confirma la recepcion o reporta cualquier problema con tu pedido.
                  </p>
                </div>

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
