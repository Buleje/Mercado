"use client";

/**
 * RevealOnScroll — wrapper que aplica fade-in + slide-up al entrar en viewport.
 *
 * Más ligero que framer-motion para casos simples (no necesita LazyMotion).
 * Usa IntersectionObserver nativo + Tailwind transitions.
 *
 * Uso:
 * ```tsx
 * <RevealOnScroll>
 *   <BodegueroSpotlight />
 * </RevealOnScroll>
 * ```
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  /** Delay antes de animar (ms). Útil para stagger entre secciones. */
  delayMs?: number;
  /** Margen del IntersectionObserver. */
  rootMargin?: string;
  className?: string;
  /**
   * Si true, NO monta los children hasta que el wrapper entra en viewport.
   * Difiere el fetch/JS de secciones below-fold (no todas montan a la vez
   * en el primer paint → home percibida más rápida). Default false.
   */
  defer?: boolean;
  /**
   * Alto mínimo reservado mientras la sección diferida aún no montó.
   * Evita layout shift (CLS) cuando el contenido aparece al scrollear.
   * Solo aplica con `defer`. Ej: "min-h-[280px]".
   */
  minHeightClass?: string;
}

export default function RevealOnScroll({
  children,
  delayMs = 0,
  rootMargin = "0px 0px -80px 0px",
  className,
  defer = false,
  minHeightClass,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setRevealed(true), delayMs);
          obs.disconnect();
        }
      },
      { rootMargin, threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delayMs, rootMargin, revealed]);

  // defer: hasta que entra en viewport, render solo un placeholder con alto
  // reservado (no monta children → no fetch → primer paint más liviano).
  if (defer && !revealed) {
    return (
      <div
        ref={ref}
        className={cn(minHeightClass, className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none",
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
