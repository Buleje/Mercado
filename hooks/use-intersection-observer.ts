"use client";

/**
 * useIntersectionObserver — Detecta cuando un elemento entra/sale del viewport.
 *
 * Casos de uso:
 *   - Lazy-load de imagenes pesadas
 *   - Trigger analytics al ver una card (impression tracking)
 *   - Infinite scroll (cuando el sentinel entra en viewport, cargar mas)
 *   - Animar cards al scrollear a ellas
 *
 * API:
 *   const { ref, isInView, entry } = useIntersectionObserver({
 *     rootMargin: "200px",
 *     once: true,  // deja de observar una vez visible
 *   });
 *
 * Variante: useInfiniteScroll — para pagination.
 */

import { useEffect, useRef, useState } from "react";

interface Options {
  /** Margen alrededor del viewport. Default "0px" */
  rootMargin?: string;
  /** Threshold: 0 = entra 1px, 1 = totalmente visible. Default 0 */
  threshold?: number | number[];
  /** Deja de observar al primer intersect. Default false */
  once?: boolean;
  /** Deshabilitar. Default false */
  disabled?: boolean;
  /** Root element (scroll container). Default viewport */
  root?: Element | null;
}

export function useIntersectionObserver<T extends Element = HTMLDivElement>({
  rootMargin = "0px",
  threshold = 0,
  once = false,
  disabled = false,
  root = null,
}: Options = {}) {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const hasBeenInView = useRef(false);

  useEffect(() => {
    if (disabled) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setIsInView(true); // fallback visible
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        setEntry(e);
        setIsInView(e.isIntersecting);
        if (e.isIntersecting && once) {
          hasBeenInView.current = true;
          observer.disconnect();
        }
      },
      { rootMargin, threshold, root },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [rootMargin, threshold, once, disabled, root]);

  return { ref, isInView, entry };
}

/**
 * useInfiniteScroll — Disparador cuando un sentinel entra en viewport.
 *
 * Uso:
 *   const { sentinelRef } = useInfiniteScroll({
 *     hasMore: !!nextPage,
 *     onLoadMore: () => loadNextPage(),
 *   });
 *
 *   return (
 *     <>
 *       {items.map(...)}
 *       {hasMore && <div ref={sentinelRef} className="h-10" />}
 *     </>
 *   );
 */
interface InfiniteScrollOptions {
  hasMore: boolean;
  onLoadMore: () => void;
  /** Rootmargin. Default "400px" para prefetch */
  rootMargin?: string;
  /** Disabled (ej. mientras loading). Default false */
  disabled?: boolean;
}

export function useInfiniteScroll({
  hasMore,
  onLoadMore,
  rootMargin = "400px",
  disabled = false,
}: InfiniteScrollOptions) {
  const { ref, isInView } = useIntersectionObserver<HTMLDivElement>({
    rootMargin,
    disabled: disabled || !hasMore,
  });
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!isInView) {
      triggeredRef.current = false;
      return;
    }
    if (!hasMore || disabled) return;
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    onLoadMore();
  }, [isInView, hasMore, disabled, onLoadMore]);

  return { sentinelRef: ref };
}
