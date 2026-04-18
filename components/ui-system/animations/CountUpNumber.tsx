"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * CountUpNumber — animacion de numero contando desde 0 hasta el target.
 *
 * Uso: landing heros, KPI cards on-mount, celebrations.
 * Duracion: ~800ms con easing editorial.
 * Solo dispara UNA vez (cuando entra al viewport con IntersectionObserver).
 * Respeta prefers-reduced-motion (muestra valor final instantáneo).
 *
 * @example
 * <CountUpNumber target={4520} prefix="S/ " />
 * <CountUpNumber target={34} suffix=" bodegas" />
 */

interface Props {
  target: number;
  /** Duration en ms — default 800 */
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Si true, empieza al montar. Si false, espera al viewport. Default false. */
  eager?: boolean;
}

export function CountUpNumber({
  target,
  duration = 800,
  decimals = 0,
  prefix,
  suffix,
  className,
  eager = false,
}: Props) {
  const [value, setValue] = useState(eager ? 0 : target);
  const elementRef = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Respeta reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- setValue al target es intencional para usuarios con reduced-motion
      setValue(target);
      return;
    }

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      setValue(0);

      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // easeOutExpo
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        setValue(target * eased);
        if (progress < 1) requestAnimationFrame(animate);
        else setValue(target);
      };
      requestAnimationFrame(animate);
    };

    if (eager) {
      start();
      return;
    }

    // IntersectionObserver — dispara cuando entra al viewport
    const el = elementRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            start();
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration, eager]);

  const formatted = value.toLocaleString("es-PE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={elementRef} className={cn("tabular-nums", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
