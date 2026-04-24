"use client";

/**
 * CountUp — Anima un numero desde 0 hasta el valor final con ease.
 *
 * Diferencia con AnimatedPrice: este es MAS simple (no formatea currency),
 * util para stats, counters, badges, loyalty points.
 *
 * Respeta reduced-motion: muestra el valor final sin animacion.
 *
 * Uso:
 *   <CountUp to={1250} duration={1200} format={(n) => n.toLocaleString()} />
 *   <CountUp to={points} suffix=" pts" />
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface Props {
  /** Valor final */
  to: number;
  /** Valor inicial. Default 0 */
  from?: number;
  /** Duracion en ms. Default 1000 */
  duration?: number;
  /** Formatter. Default toLocaleString es-PE */
  format?: (n: number) => string;
  /** Sufijo. Ej " pts" */
  suffix?: string;
  /** Prefijo. Ej "S/" */
  prefix?: string;
  /** ClassName */
  className?: string;
  /** Animar solo al entrar en viewport. Default false */
  animateOnInView?: boolean;
}

export default function CountUp({
  to,
  from = 0,
  duration = 1000,
  format,
  suffix,
  prefix,
  className,
  animateOnInView = false,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(reducedMotion || animateOnInView ? to : from);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setValue(to);
      return;
    }
    // Reset start values cada vez que cambia "to"
    startValueRef.current = value;
    startTimeRef.current = null;

    const step = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const t = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startValueRef.current + (to - startValueRef.current) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, duration, reducedMotion]);

  const display = format
    ? format(Math.round(value))
    : Math.round(value).toLocaleString("es-PE");

  return (
    <span className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
