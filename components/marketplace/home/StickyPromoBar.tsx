"use client";

/**
 * StickyPromoBar — mini banner sticky que aparece al scroll > 600px.
 *
 * Psicología: cuando el user ya navegó un rato, recordar oferta activa
 * (cupón / envío gratis / próxima entrega) sin interrumpir.
 *
 * Comportamiento:
 *   - Aparece slide-in desde top cuando scrollY > 600.
 *   - Dismissible — guarda en sessionStorage hasta cerrar tab.
 *   - Click → /marketplace/ofertas
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Truck, X, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useFreeShippingStatus } from "@/components/marketplace/MarketplaceFreeShippingBar";

const DISMISS_KEY = "marketplace-sticky-promo-dismissed";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/**
 * StickyPromoBar — mensaje contextual segun estado del cart:
 *   - Sin items → cupón BIENVENIDO10
 *   - Con items pero NO envío gratis → "Faltan S/X para envío gratis" (con barra)
 *   - Con items Y envío gratis desbloqueado → "Envío gratis desbloqueado!"
 */
export default function StickyPromoBar() {
  const { hasItems, unlocked, remaining, progress } = useFreeShippingStatus();

  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (dismissed) return;
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [dismissed]);

  if (dismissed || !visible) return null;

  // Branch contextual
  let content: React.ReactNode;
  if (!hasItems) {
    content = (
      <>
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
        <Link
          href="/marketplace/ofertas"
          className="flex-1 min-w-0 text-[length:var(--ts-xs)] font-medium truncate hover:opacity-90"
        >
          <strong>BIENVENIDO10</strong> · 10% off en tu primera compra
        </Link>
      </>
    );
  } else if (unlocked) {
    content = (
      <>
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
        <Link
          href="/marketplace/carrito"
          className="flex-1 min-w-0 text-[length:var(--ts-xs)] font-medium truncate hover:opacity-90"
        >
          <strong>Envío gratis desbloqueado</strong> · Ir al checkout
        </Link>
      </>
    );
  } else {
    content = (
      <Link
        href="/marketplace/carrito"
        className="flex-1 min-w-0 flex items-center gap-3 hover:opacity-90"
      >
        <Truck className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--ts-xs)] font-medium leading-tight">
            Faltan <strong>{fmt(remaining)}</strong> para envío gratis
          </p>
          <div className="mt-1 h-1 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "fixed top-16 left-1/2 -translate-x-1/2 z-40",
        "max-w-md w-[calc(100%-2rem)]",
        "animate-in slide-in-from-top-2 fade-in duration-300",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-full",
          "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
          "shadow-lg shadow-black/20",
        )}
      >
        {content}
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* silent */
            }
            setDismissed(true);
          }}
          aria-label="Cerrar"
          className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--surface-canvas)]/70 hover:bg-white/10 hover:text-[var(--surface-canvas)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
