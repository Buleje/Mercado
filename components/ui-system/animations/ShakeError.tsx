"use client";

import { m, useAnimationControls } from "framer-motion";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * ShakeError — shake horizontal sutil cuando hay error de validacion.
 *
 * Uso: form fields con error, wrong OTP, yape verification failed.
 * Timing: 3 vaivenes en 400ms. Muy contenido (4px max).
 *
 * @example
 * <ShakeError trigger={hasError}>
 *   <input className={hasError ? "border-[var(--data-error-500)]" : ""} />
 * </ShakeError>
 */

interface Props {
  trigger: boolean | number;
  children: React.ReactNode;
  className?: string;
  /** Intensidad — default 4 */
  amplitude?: number;
}

export function ShakeError({ trigger, children, className, amplitude = 4 }: Props) {
  const controls = useAnimationControls();

  useEffect(() => {
    if (!trigger) return;
    if (typeof window !== "undefined") {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    }
    controls.start({
      x: [0, -amplitude, amplitude, -amplitude, amplitude, 0],
      transition: { duration: 0.4, ease: "easeInOut" },
    });
  }, [trigger, amplitude, controls]);

  return (
    <m.div animate={controls} className={cn("inline-block w-full", className)}>
      {children}
    </m.div>
  );
}
