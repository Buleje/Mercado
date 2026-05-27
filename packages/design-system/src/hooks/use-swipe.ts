"use client";

import { useRef, useCallback } from "react";

/**
 * useSwipe — detecta swipe horizontal en mobile.
 *
 * @param onSwipeLeft  - Se llama al deslizar hacia la izquierda (siguiente)
 * @param onSwipeRight - Se llama al deslizar hacia la derecha (anterior)
 * @param threshold    - Distancia minima en px para considerar un swipe (default 75)
 *
 * Solo activa en viewport mobile (<768px) para no interferir con mouse en desktop.
 *
 * @example
 * const swipe = useSwipe(() => next(), () => prev());
 * <div {...swipe}>{content}</div>
 */
export function useSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold = 75,
) {
  const startX = useRef<number>(0);
  const startY = useRef<number>(0);
  const endX = useRef<number>(0);
  const endY = useRef<number>(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.targetTouches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    endX.current = t.clientX;
    endY.current = t.clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.targetTouches[0];
    endX.current = t.clientX;
    endY.current = t.clientY;
  }, []);

  const onTouchEnd = useCallback(() => {
    const diffX = startX.current - endX.current;
    const diffY = startY.current - endY.current;

    // Solo activar en viewport mobile (<768px)
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;

    // Debe superar el umbral horizontal…
    if (Math.abs(diffX) < threshold) return;
    // …y ser un gesto CLARAMENTE horizontal. Si el movimiento vertical domina
    // (scroll para arriba/abajo), NO navegamos de tab.
    // Fix Brandon 2026-05-27: al deslizar para scrollear te mandaba a Chat IA.
    if (Math.abs(diffX) <= Math.abs(diffY) * 1.3) return;

    if (diffX > 0) {
      onSwipeLeft();
    } else {
      onSwipeRight();
    }
  }, [onSwipeLeft, onSwipeRight, threshold]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
