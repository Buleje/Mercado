"use client";

/**
 * AnimatedCounter — número que sube de 0 al valor final cuando entra al viewport.
 * Estilo "55.8m / 46.5m / 8.1m" de beastphilanthropy.org.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Decimales a mostrar (default 0). */
  decimals?: number;
  /** Prefijo (ej: "S/", "$"). */
  prefix?: string;
  /** Sufijo (ej: "+", "k", "M"). */
  suffix?: string;
  /** Formato locale (default "es-PE"). */
  locale?: string;
  /** Duración del count-up en ms (default 1400). */
  duration?: number;
  /** Delay inicial (default 0). */
  delay?: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedCounter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  locale = "es-PE",
  duration = 1400,
  delay = 0,
}: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            const start = performance.now() + delay;
            let raf: number;
            const tick = (now: number) => {
              const elapsed = Math.max(0, now - start);
              const t = Math.min(1, elapsed / duration);
              setDisplay(value * easeOutCubic(t));
              if (t < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
            obs.disconnect();
            return () => cancelAnimationFrame(raf);
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [value, duration, delay]);

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(display);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
