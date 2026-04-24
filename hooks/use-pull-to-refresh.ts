"use client";

/**
 * usePullToRefresh — Pull-down para refrescar al estilo iOS/Android.
 *
 * Detecta touch drag desde el top del scroll; cuando pasa el threshold,
 * dispara onRefresh y muestra indicador visual (controlado por el consumer
 * via el state `distance` + `isRefreshing`).
 *
 * Uso:
 *   const { ref, distance, isRefreshing, isPulling } = usePullToRefresh({
 *     onRefresh: async () => { await refetch(); },
 *     threshold: 80,
 *   });
 *   return (
 *     <div ref={ref} className="overflow-y-auto h-full">
 *       <PullIndicator distance={distance} isRefreshing={isRefreshing} />
 *       ...
 *     </div>
 *   );
 *
 * Respeta reduced-motion (sin easing) y solo se activa si scrollTop === 0.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  /** Threshold en px para disparar refresh. Default 80 */
  threshold?: number;
  /** Drag max visible. Default 120 */
  maxDistance?: number;
  /** Resistance factor (mas alto = mas duro de tirar). Default 2.5 */
  resistance?: number;
  /** Handler al completar el pull */
  onRefresh: () => void | Promise<void>;
  /** Deshabilitar. Default false */
  disabled?: boolean;
}

export function usePullToRefresh<T extends HTMLElement = HTMLElement>({
  threshold = 80,
  maxDistance = 120,
  resistance = 2.5,
  onRefresh,
  disabled = false,
}: Options) {
  const ref = useRef<T>(null);
  const startYRef = useRef<number | null>(null);
  const [distance, setDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  const reset = useCallback(() => {
    setDistance(0);
    setIsPulling(false);
    startYRef.current = null;
  }, []);

  const doRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      reset();
    }
  }, [onRefresh, reset]);

  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (el.scrollTop > 0) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (startYRef.current === null) return;
      if (el.scrollTop > 0) {
        startYRef.current = null;
        setDistance(0);
        setIsPulling(false);
        return;
      }
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        setDistance(0);
        setIsPulling(false);
        return;
      }
      // prevent default only when pulling down
      e.preventDefault();
      const withResistance = Math.min(delta / resistance, maxDistance);
      setDistance(withResistance);
      setIsPulling(withResistance > 0);
    };

    const onTouchEnd = () => {
      if (isRefreshing) return;
      if (distance >= threshold) {
        void doRefresh();
      } else {
        reset();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", reset);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", reset);
    };
  }, [disabled, distance, threshold, maxDistance, resistance, isRefreshing, doRefresh, reset]);

  const progress = Math.min(distance / threshold, 1);

  return { ref, distance, progress, isRefreshing, isPulling };
}
