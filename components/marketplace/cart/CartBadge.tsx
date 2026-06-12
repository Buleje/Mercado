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
}: {
  onClick: () => void;
}) {
  const { itemCount } = useMarketplaceCart();
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

  const hasItems = itemCount > 0;

  // Brandon 2026-06-06 (rediseño minimalista): botón circular BLANCO
  // (surface-raised) con icono oscuro y badge count chico arriba a la
  // derecha — sin pill verde gradiente, sin total inline, sin animación
  // infinita. El total vive en el drawer del carrito. Se mantiene el
  // pulse breve + floater "+N" al agregar (feedback útil).
  return (
    <div className="relative">
      <motion.button
        onClick={onClick}
        animate={
          pulse
            ? { scale: [1, 1.18, 0.95, 1.08, 1] }
            : { scale: 1 }
        }
        transition={
          pulse
            ? { duration: 0.7, ease: [0.16, 1, 0.3, 1] }
            : { duration: 0.2 }
        }
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label={`Carrito — ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`}
        className={cn(
          // Brandon 2026-06-12: más grande (h-12) + fondo de reposo para que
          // resalte en el nav (antes transparente, se perdía).
          "relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-sunken)]/70 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
          pulse && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]",
        )}
      >
        {/* Icono — limpio, sin badge encima */}
        <span className="relative inline-flex items-center justify-center">
          <ShoppingCart
            className="h-6 w-6 shrink-0"
            strokeWidth={2}
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
        {/* Badge count — chico, arriba a la derecha (minimalista) */}
        <AnimatePresence>
          {hasItems && (
            <motion.span
              key={`count-${itemCount}`}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-[var(--surface-canvas)]"
            >
              {itemCount > 99 ? "99+" : itemCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
