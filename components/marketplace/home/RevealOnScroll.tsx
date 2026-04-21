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
}

export default function RevealOnScroll({
  children,
  delayMs = 0,
  rootMargin = "0px 0px -80px 0px",
  className,
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
