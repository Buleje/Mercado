"use client";

/**
 * useHoverPrefetch
 *
 * Cuando el usuario posa el cursor sobre un elemento durante `delay` ms,
 * llama a `router.prefetch(href)` para que la pagina de destino se precargue
 * antes del clic.
 *
 * Uso:
 *   const { onMouseEnter, onMouseLeave } = useHoverPrefetch("/marketplace/mi-tienda");
 *   <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>...</div>
 */

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

export interface HoverPrefetchHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * @param href  URL a precargar cuando el hover supera el delay.
 * @param delay Tiempo en ms antes de disparar el prefetch. Default: 500.
 */
export function useHoverPrefetch(
  href: string,
  delay: number = 500,
): HoverPrefetchHandlers {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = useCallback(() => {
    if (timerRef.current !== null) return; // ya hay un timer activo
    timerRef.current = setTimeout(() => {
      router.prefetch(href);
      timerRef.current = null;
    }, delay);
  }, [href, delay, router]);

  const onMouseLeave = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { onMouseEnter, onMouseLeave };
}
