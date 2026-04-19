"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, X, ArrowRight } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "framer-motion";
import { useCart } from "@/contexts/cart-context";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";

// 30 minutes before we consider cart "abandoned"
const IDLE_MS = 30 * 60 * 1000;
// 4 hours before the banner can re-appear after being dismissed
const DISMISS_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export default function AbandonedCartRecovery() {
  const { total, openCheckout } = useCart();
  const slug = useTenantSlug();
  const [visible, setVisible] = useState(false);
  const [savedTotal, setSavedTotal] = useState(0);

  useEffect(() => {
    // Wait 2s for cart context to hydrate from localStorage, then check
    const t = setTimeout(() => {
      try {
        const ts = localStorage.getItem(tenantKey(slug, "cart-ts"));
        if (!ts) return;

        const age = Date.now() - parseInt(ts, 10);
        if (age < IDLE_MS) return; // abandoned less than 30 min ago

        const dismissed = localStorage.getItem(tenantKey(slug, "cart-dismissed"));
        if (dismissed && Date.now() - parseInt(dismissed, 10) < DISMISS_COOLDOWN_MS) return;

        const cartStr = localStorage.getItem(tenantKey(slug, "cart"));
        if (!cartStr) return;
        const cartItems: { price: number; quantity: number }[] = JSON.parse(cartStr);
        if (!Array.isArray(cartItems) || cartItems.length === 0) return;

        const t = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
        setSavedTotal(t);
        setVisible(true);

        // Fire abandoned-cart email (best-effort, does not block UI)
        fetch("/api/abandoned-cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: cartItems, total: t }),
        }).catch(() => {});
      } catch { /* ignore */ }
    }, 2000);
    return () => clearTimeout(t);
  }, [slug]);

  const dismiss = () => {
    localStorage.setItem(tenantKey(slug, "cart-dismissed"), Date.now().toString());
    setVisible(false);
  };

  const recover = () => {
    setVisible(false);
    openCheckout();
  };

  const displayTotal = total > 0 ? total : savedTotal;

  return (
    <AnimatePresence>
      {visible && displayTotal > 0 && (
        <m.div
          initial={{ opacity: 0, y: 80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.95 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-8000 w-full max-w-sm px-4"
          role="alertdialog"
          aria-label="Carrito abandonado"
        >
          <div className="flex items-center gap-3 bg-primary-dark shadow-2xl shadow-black/40 text-white rounded-2xl px-4 py-3.5 border border-white/10 backdrop-blur-sm">
            {/* Icon */}
            <div className="relative shrink-0">
              <div className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 animate-ping" />
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400" />
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-[length:var(--ts-2xs)] text-white/60 font-medium leading-none mb-0.5">¡No olvides tu pedido!</p>
              <p className="text-sm font-extrabold text-white leading-none">S/{displayTotal.toFixed(2)} en tu carrito</p>
            </div>
            {/* CTA */}
            <button
              onClick={recover}
              className="flex items-center gap-1 bg-white text-primary font-bold text-xs px-3 py-2 rounded-xl hover:bg-white/90 active:scale-95 transition-all shrink-0 shadow-sm"
            >
              Completar
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            {/* Dismiss */}
            <button
              onClick={dismiss}
              className="text-white/40 hover:text-white transition-colors shrink-0 p-1 -mr-1"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Progress bar (auto-hide after 8s) */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl bg-white/10 overflow-hidden">
              <div className="h-full bg-amber-400/60 animate-[shrink_8s_linear_forwards]" />
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
