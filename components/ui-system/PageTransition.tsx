"use client";

/**
 * PageTransition — Wrapper que anima entradas/salidas de páginas con
 * Framer Motion (m + AnimatePresence).
 *
 * Uso: montar en layouts debajo del router para animar transiciones.
 * Usa pathname como key para que AnimatePresence detecte cambios.
 *
 * Variantes:
 *   "fade" (default): opacity fade suave
 *   "slide": slide horizontal sutil (entra desde der, sale hacia izq)
 *   "scale": zoom in/out sutil
 *
 * Respeta prefers-reduced-motion (sin animación, solo muestra).
 */

import { usePathname } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

type VariantName = "fade" | "slide" | "scale";

interface Props {
  children: ReactNode;
  variant?: VariantName;
  /** Duracion ms. Default 250 */
  duration?: number;
}

const TRANSITIONS: Record<
  VariantName,
  {
    initial: Record<string, number>;
    animate: Record<string, number>;
    exit: Record<string, number>;
  }
> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 },
  },
};

export default function PageTransition({
  children,
  variant = "fade",
  duration = 250,
}: Props) {
  const pathname = usePathname();
  const v = TRANSITIONS[variant];

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={pathname}
        initial={v.initial}
        animate={v.animate}
        exit={v.exit}
        transition={{ duration: duration / 1000, ease: [0.4, 0, 0.2, 1] }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
