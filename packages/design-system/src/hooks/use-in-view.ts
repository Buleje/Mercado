"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useInView — detecta cuando un elemento entra al viewport.
 *
 * Una sola vez por defecto (disconnect al primer intersect).
 * Threshold 5%, rootMargin 200px (pre-carga generosa).
 *
 * @example
 * const [ref, inView] = useInView<HTMLDivElement>();
 * return <div ref={ref}>{inView && <HeavyComponent />}</div>;
 */
export function useInView<T extends Element = HTMLDivElement>(
  options?: IntersectionObserverInit,
) {
  const ref = useRef<T>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "200px", ...options },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options is an object literal from call site; adding it would cause infinite re-renders
  }, [isInView]);

  return [ref, isInView] as const;
}
