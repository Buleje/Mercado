"use client";

import { useState, useEffect } from "react";
import { X, Gift, ArrowRight, ShoppingCart } from "@buleje/design-system/icons";
import Link from "next/link";
import { useCart } from "@/contexts/cart-context";
import { useSettings } from "@/contexts/settings-context";
import { trackExitIntentShown, trackExitIntentAction } from "@/lib/analytics";

interface ExitIntentModalProps {
  /** Delay in ms after page load before enabling exit detection (default: 5000) */
  delay?: number;
  /** Whether to show the modal (for testing) */
  forceShow?: boolean;
}

export default function ExitIntentModal({ delay = 5000, forceShow = false }: ExitIntentModalProps) {
  const [show, setShow] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const { count, total, toggle } = useCart();
  const { homepage: hp } = useSettings();
  const promoCode = hp.exitPromoCode || "BIENVENIDO";
  const promoMin = hp.exitPromoMinAmount ?? 50;

  useEffect(() => {
    // Check if already shown in this session
    const shown = sessionStorage.getItem("buleje:exitIntentShown");
    if (shown === "true" && !forceShow) return;

    // Enable after delay
    const timer = setTimeout(() => setEnabled(true), delay);

    return () => clearTimeout(timer);
  }, [delay, forceShow]);

  useEffect(() => {
    if (!enabled && !forceShow) return;

    const handleMouseLeave = (e: MouseEvent) => {
      // Only trigger if mouse exits from top (y <= 0) and moving upward
      if (e.clientY <= 0 && e.movementY < 0) {
        const shown = sessionStorage.getItem("buleje:exitIntentShown");
        if (shown !== "true" || forceShow) {
          setShow(true);
          sessionStorage.setItem("buleje:exitIntentShown", "true");
          // Track exit intent shown
          trackExitIntentShown(count > 0);
        }
      }
    };

    // Only on desktop (width >= 1024px)
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    if (mediaQuery.matches) {
      document.addEventListener("mouseleave", handleMouseLeave);
    }

    // Mobile: detect tab switch / background via visibilitychange
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const shown = sessionStorage.getItem("buleje:exitIntentShown");
        if (shown !== "true" || forceShow) {
          // Show when user returns
          const handleReturn = () => {
            if (document.visibilityState === "visible") {
              setShow(true);
              sessionStorage.setItem("buleje:exitIntentShown", "true");
              trackExitIntentShown(count > 0);
              document.removeEventListener("visibilitychange", handleReturn);
            }
          };
          document.addEventListener("visibilitychange", handleReturn);
        }
      }
    };

    if (!mediaQuery.matches) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    const handleMediaChange = () => {
      if (mediaQuery.matches) {
        document.addEventListener("mouseleave", handleMouseLeave);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      } else {
        document.removeEventListener("mouseleave", handleMouseLeave);
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, [enabled, forceShow, count]);

  const handleClose = () => {
    setShow(false);
    trackExitIntentAction("dismissed");
  };

  // Show cart reminder if user has items, otherwise show discount offer
  const hasCartItems = count > 0;

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeDown_0.25s_ease-out]">
      <div role="dialog" aria-modal="true" aria-label="Oferta antes de irte" className="relative bg-[var(--surface-raised)] rounded-3xl shadow-[var(--shadow-xl)] max-w-lg w-full mx-4 overflow-hidden animate-[scaleIn_0.3s_ease-out]">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-surface/80 transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5 text-muted" />
        </button>

        {/* Gradient header */}
        <div className="relative h-32 bg-linear-to-br from-primary via-primary-dark to-accent overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.15)_0.5px,transparent_0.5px)] bg-size-[24px_24px] opacity-30" />
          <div className="absolute inset-0 flex items-center justify-center">
            {hasCartItems ? (
              <ShoppingCart className="h-16 w-16 text-white/90" />
            ) : (
              <Gift className="h-16 w-16 text-white/90" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          {hasCartItems ? (
            <>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] mb-3">
                ¡No olvides tu carrito!
              </h2>
              <p className="text-muted text-base mb-2">
                Tienes <strong className="text-primary">{count} producto{count > 1 ? "s" : ""}</strong> esperándote
              </p>
              <p className="text-lg font-bold text-primary mb-6">
                Total: S/{total.toFixed(2)}
              </p>
              <p className="text-sm text-muted mb-6">
                Completa tu pedido ahora y recíbelo en menos de 30 minutos 🚚
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    trackExitIntentAction("view_cart");
                    handleClose();
                    // Open cart sidebar
                    toggle();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-6 py-4 font-bold shadow-[var(--shadow-md)] hover:bg-primary-dark transition-all"
                >
                  Ver mi carrito
                  <ArrowRight className="h-5 w-5" />
                </button>
                <button
                  onClick={handleClose}
                  className="text-sm text-muted hover:text-[var(--text-primary)] transition-colors"
                >
                  Seguir comprando
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] mb-3 inline-flex items-center gap-2">
                ¡Espera! <Gift className="h-7 w-7 text-primary" aria-hidden />
              </h2>
              <p className="text-muted text-base mb-6">
                Aprovecha <strong className="text-primary">delivery GRATIS</strong> en tu primera compra mayor a S/{promoMin}
              </p>
              <div className="bg-linear-to-r from-secondary/10 to-primary/10 rounded-2xl p-5 mb-6 border-2 border-dashed border-primary/20">
                <p className="text-sm font-semibold text-muted mb-2">Código de descuento</p>
                <p className="text-3xl font-extrabold text-primary tracking-wider">{promoCode}</p>
                <p className="text-xs text-muted mt-2">Válido en compras mayores a S/{promoMin}</p>
              </div>
              <div className="flex flex-col gap-3">
                <Link
                  href="/tienda"
                  onClick={() => {
                    trackExitIntentAction("cta_clicked");
                    handleClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-6 py-4 font-bold shadow-[var(--shadow-md)] hover:bg-primary-dark transition-all"
                >
                  Explorar tienda
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <button
                  onClick={handleClose}
                  className="text-sm text-muted hover:text-[var(--text-primary)] transition-colors"
                >
                  No, gracias
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
