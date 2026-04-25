"use client";

/**
 * StickyCartBar — barra inferior flotante que aparece cuando hay items
 * en el carrito de marketplace. Solo mobile/tablet (lg:hidden) — en
 * desktop ya hay carrito visible en el navbar.
 *
 * Comportamiento:
 *   - Hidden si items === 0
 *   - Slide-up desde bottom con framer-motion al entrar
 *   - Aria-live polite — anuncia el subtotal cuando cambia
 *   - Muestra "N productos · S/ X" + CTA "Ver mi carrito"
 *
 * Reglas:
 *   - Totales solo preview — el server recalcula en checkout (CLAUDE.md #6)
 *   - No modifica el carrito, solo muestra estado
 */

import Link from "next/link";
import { useMemo } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, ArrowRight } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function StickyCartBar() {
  const { items } = useMarketplaceCart();

  const { totalQty, subtotal } = useMemo(() => {
    let q = 0;
    let s = 0;
    for (const it of items) {
      q += it.quantity;
      s += it.price * it.quantity;
    }
    return { totalQty: q, subtotal: s };
  }, [items]);

  return (
    <AnimatePresence>
      {totalQty > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          aria-live="polite"
          className="fixed bottom-3 left-3 right-3 z-40 lg:hidden"
        >
          <Link
            href="/marketplace/carrito"
            className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)] active:scale-[0.99] transition-transform"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]">
                <ShoppingCart className="h-5 w-5" strokeWidth={2} aria-hidden />
                <span className="absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--surface-canvas)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-[var(--text-primary)] ring-2 ring-[var(--text-primary)]">
                  {totalQty > 99 ? "99+" : totalQty}
                </span>
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-[var(--surface-canvas)]/70">
                  Tu carrito
                </span>
                <span className="text-base font-black tabular-nums leading-tight">
                  {fmt(subtotal)}
                </span>
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-sm font-bold text-white shrink-0">
              Ver carrito
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
