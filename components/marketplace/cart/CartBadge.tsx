"use client";

/**
 * CartBadge — botón de carrito con contador + total inline y micro-animaciones.
 *
 * PERF 2026-05-24: extraído de MarketplaceCart.tsx (1356 líneas). Antes,
 * importar `{ CartBadge }` arrastraba todo el drawer del carrito + su lógica
 * de checkout al chunk inicial de cualquier página con badge (storefront,
 * navbar). Ahora el badge vive solo acá (~3KB + framer); el drawer se carga
 * on-demand cuando el usuario lo abre.
 */

import React from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { ShoppingCart } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { cn } from "@/lib/utils";

export function CartBadge({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  /** Modo compacto: solo cantidad, sin precio inline. */
  compact?: boolean;
}) {
  const { itemCount, grandTotal } = useMarketplaceCart();
  const [pulse, setPulse] = React.useState(false);
  const [floater, setFloater] = React.useState<{ id: number; delta: number } | null>(null);
  const prevCountRef = React.useRef(itemCount);
  const floaterIdRef = React.useRef(0);

  // Pulse animation + floater "+N" cuando itemCount aumenta. Mas largo y
  // mas prominente (Brandon, mayo 14 2026): la animacion anterior era tan
  // sutil que pasaba desapercibida. Ahora: 1.4s pulse + ring + +N flotante.
  React.useEffect(() => {
    if (itemCount > prevCountRef.current) {
      const delta = itemCount - prevCountRef.current;
      setPulse(true);
      const myId = ++floaterIdRef.current;
      setFloater({ id: myId, delta });
      const tPulse = setTimeout(() => setPulse(false), 1400);
      const tFloater = setTimeout(() => {
        setFloater((curr) => (curr?.id === myId ? null : curr));
      }, 1100);
      prevCountRef.current = itemCount;
      return () => {
        clearTimeout(tPulse);
        clearTimeout(tFloater);
      };
    }
    prevCountRef.current = itemCount;
  }, [itemCount]);

  const fmtPrice = (n: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      maximumFractionDigits: 0,
    }).format(n);

  const hasItems = itemCount > 0;

  return (
    <div className="relative">
      <motion.button
        onClick={onClick}
        animate={
          pulse
            ? {
                scale: [1, 1.22, 0.94, 1.12, 1],
                rotate: [0, -10, 10, -5, 0],
              }
            : hasItems
              ? {
                  scale: [1, 1.045, 1],
                  rotate: [0, 0, 0],
                }
              : { scale: 1, rotate: 0 }
        }
        transition={
          pulse
            ? { duration: 0.9, ease: [0.16, 1, 0.3, 1] }
            : hasItems
              ? { duration: 3.6, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }
              : { duration: 0.2 }
        }
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label={`Carrito — ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`}
        className={cn(
          "relative inline-flex items-center gap-2.5 h-11 rounded-full transition-colors shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
          hasItems
            ? "bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white hover:brightness-110 pl-3.5 pr-4 text-sm font-bold shadow-[0_8px_24px_-8px_color-mix(in_oklch,var(--accent)_55%,transparent)]"
            : "w-11 justify-center border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
          pulse && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]",
        )}
      >
        {/* Icono — limpio, sin badge encima */}
        <span className="relative inline-flex items-center justify-center">
          <ShoppingCart
            className="h-5 w-5 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {/* Doble ring expansivo — primero rapido, segundo lento, mas notorio */}
          <AnimatePresence>
            {pulse && hasItems && (
              <>
                <motion.span
                  key="pulse-ring-1"
                  initial={{ scale: 0.7, opacity: 0.85 }}
                  animate={{ scale: 3.2, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.85, ease: "easeOut" }}
                  className="absolute inset-0 rounded-full border-2 border-[var(--accent)] pointer-events-none"
                  aria-hidden
                />
                <motion.span
                  key="pulse-ring-2"
                  initial={{ scale: 0.7, opacity: 0.6 }}
                  animate={{ scale: 4, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
                  className="absolute inset-0 rounded-full border-2 border-[var(--accent)]/60 pointer-events-none"
                  aria-hidden
                />
              </>
            )}
          </AnimatePresence>
          {/* Floater "+N" que sale del icono hacia arriba */}
          <AnimatePresence>
            {floater && (
              <motion.span
                key={`floater-${floater.id}`}
                initial={{ y: 0, opacity: 0, scale: 0.5 }}
                animate={{ y: -32, opacity: [0, 1, 1, 0], scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.0, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
                className="absolute left-1/2 -translate-x-1/2 -top-1 inline-flex items-center justify-center min-w-[1.4rem] h-6 px-1.5 rounded-full bg-[var(--accent)] text-white text-[length:var(--ts-xs)] font-black tabular-nums shadow-lg pointer-events-none"
                aria-hidden
              >
                +{floater.delta}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        {/* Contador + total INLINE cuando hay items — no tapa el icono */}
        <AnimatePresence mode="wait">
          {hasItems && (
            <motion.span
              key={`meta-${itemCount}-${Math.round(grandTotal)}`}
              initial={{ opacity: 0, x: -6, width: 0 }}
              animate={{ opacity: 1, x: 0, width: "auto" }}
              exit={{ opacity: 0, x: -6, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 whitespace-nowrap overflow-hidden"
            >
              <span className="inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[length:var(--ts-xs)] font-black tabular-nums text-white">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
              {!compact && (
                <>
                  <span
                    aria-hidden
                    className="h-4 w-px bg-current opacity-25"
                  />
                  <span className="tabular-nums font-black text-sm">
                    {fmtPrice(grandTotal)}
                  </span>
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
