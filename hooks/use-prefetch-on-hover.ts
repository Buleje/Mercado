"use client";

/**
 * usePrefetchOnHover — prefetch data cuando el user pasa mouse sobre algo.
 *
 * Cuando el dueño pasa el cursor sobre "Inventario" en el sidebar (300ms),
 * se dispara el fetch de los datos. Cuando hace click, los datos YA están.
 * Sensación de "instant".
 *
 * Uso:
 *   const prefetch = usePrefetchOnHover(() => {
 *     void fetch("/api/admin/inventory");  // cachea response en browser
 *   });
 *
 *   <button {...prefetch.handlers} onClick={navigate}>Inventario</button>
 *
 * El handler solo se dispara 1 vez por mount (evita fetch repetido).
 */

import { useCallback, useRef } from "react";

interface PrefetchHandlers {
  onMouseEnter: () => void;
  onFocus: () => void;
}

export function usePrefetchOnHover(
  prefetchFn: () => void | Promise<void>,
  /** Delay antes de disparar el prefetch (ms). Default 150. */
  delayMs: number = 150,
): { handlers: PrefetchHandlers; reset: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const trigger = useCallback(() => {
    if (firedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      void prefetchFn();
    }, delayMs);
  }, [prefetchFn, delayMs]);

  const reset = useCallback(() => {
    firedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    handlers: { onMouseEnter: trigger, onFocus: trigger },
    reset,
  };
}
