"use client";

import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

/**
 * ConfettiBurst — explosion canvas-confetti wrapped en un componente React.
 *
 * Uso: delight moments (level up, first order, birthday).
 * Paleta: editorial (gray-900, white, brand-accent) — nunca rainbow.
 * Respeta prefers-reduced-motion.
 *
 * @example
 * // Trigger imperativo via hook:
 * const { celebrate } = useCelebrate();
 * celebrate('confetti');
 *
 * // O como componente reactivo:
 * {showConfetti && <ConfettiBurst />}
 */

interface Props {
  /** Origen X del burst (0-1) — default 0.5 centro */
  originX?: number;
  /** Origen Y del burst (0-1) — default 0.6 bajo */
  originY?: number;
  /** Particulas a lanzar — default 60 */
  particleCount?: number;
  /** Spread grados — default 70 */
  spread?: number;
  /** Paleta de colores — default editorial (mono + accent) */
  colors?: string[];
  /** Si true, se auto-dispara al mount. Default true. */
  autoFire?: boolean;
  /** Callback cuando termina */
  onComplete?: () => void;
}

const EDITORIAL_COLORS = ["#0a0a0a", "#525252", "var(--accent)", "#fafafa"];

export function ConfettiBurst({
  originX = 0.5,
  originY = 0.6,
  particleCount = 60,
  spread = 70,
  colors = EDITORIAL_COLORS,
  autoFire = true,
  onComplete,
}: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!autoFire || firedRef.current) return;
    firedRef.current = true;

    // Respeta prefers-reduced-motion
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onComplete?.();
      return;
    }

    confetti({
      particleCount,
      spread,
      origin: { x: originX, y: originY },
      colors,
      startVelocity: 35,
      gravity: 1,
      ticks: 200,
      scalar: 0.9,
    });

    const timer = setTimeout(() => onComplete?.(), 1500);
    return () => clearTimeout(timer);
  }, [autoFire, originX, originY, particleCount, spread, colors, onComplete]);

  return null;
}

/**
 * fireConfetti — trigger imperativo sin componente.
 * Usar dentro de event handlers.
 */
export function fireConfetti(options?: Partial<confetti.Options>) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  confetti({
    particleCount: 60,
    spread: 70,
    origin: { x: 0.5, y: 0.6 },
    colors: EDITORIAL_COLORS,
    startVelocity: 35,
    gravity: 1,
    ticks: 200,
    scalar: 0.9,
    ...options,
  });
}
