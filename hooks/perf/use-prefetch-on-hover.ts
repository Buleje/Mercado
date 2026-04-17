"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

/**
 * usePrefetchOnHover — prefetcha una ruta Next al hover con 100ms delay.
 *
 * Patrón Linear/Vercel: al pasar el mouse sobre un link, disparar prefetch
 * con un pequeño debounce. Para que la navegación sea instantánea cuando
 * el usuario hace click. Ahorra ~300-500ms vs click frío.
 *
 * Next.js 16 ya prefetcha links visibles en viewport, pero hover
 * prefetch cubre links que no están en viewport inicial (menús, dropdowns).
 *
 * @example
 * const handlers = usePrefetchOnHover("/admin/inventario");
 * <Link href="/admin/inventario" {...handlers}>Inventario</Link>
 */
export function usePrefetchOnHover(href: string) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedRef = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (prefetchedRef.current) return;
    timerRef.current = setTimeout(() => {
      router.prefetch(href);
      prefetchedRef.current = true;
    }, 100);
  }, [href, router]);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleMouseEnter,
    onBlur: handleMouseLeave,
  };
}
