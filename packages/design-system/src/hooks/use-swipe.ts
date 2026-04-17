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
  const touchStart = useRef<number>(0);
  const touchEnd = useRef<number>(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = e.targetTouches[0].clientX;
    touchEnd.current = e.targetTouches[0].clientX;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(() => {
    const diff = touchStart.current - touchEnd.current;
    if (Math.abs(diff) < threshold) return;

    // Solo activar en viewport mobile (<768px)
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;

    if (diff > 0) {
      onSwipeLeft();
    } else {
      onSwipeRight();
    }
  }, [onSwipeLeft, onSwipeRight, threshold]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
