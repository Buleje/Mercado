"use client";

/**
 * CountUpNumber — anima un número del valor anterior al nuevo.
 *
 * Cuando cargan KPIs o refrescás el dashboard, los números "cuentan"
 * desde donde estaban hasta el nuevo valor en ~800ms. Feedback visual
 * que algo cambió. Respeta prefers-reduced-motion.
 *
 * Uso:
 *   <CountUpNumber value={1250.50} format={(v) => `S/ ${v.toFixed(2)}`} />
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** ms. Default 800. */
  duration?: number;
  /** Función para formatear el valor animado. */
  format?: (v: number) => string;
  /** Clase extra del span contenedor. */
  className?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUpNumber({ value, duration = 800, format, className }: Props) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    // Respetar prefers-reduced-motion — saltar animación
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }

    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className}>
      {format ? format(display) : display.toFixed(0)}
    </span>
  );
}

export default CountUpNumber;
