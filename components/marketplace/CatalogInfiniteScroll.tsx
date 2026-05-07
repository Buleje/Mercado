"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "@buleje/design-system/icons";

interface UseInfiniteScrollOptions {
  rootMargin?: string;
  threshold?: number;
}

export function useInfiniteScroll(
  loadMore: () => Promise<void>,
  options?: UseInfiniteScrollOptions
): { sentinelRef: React.RefObject<HTMLDivElement | null>; isLoading: React.RefObject<boolean> } {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoading = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (isLoading.current) return;
        if (cooldownRef.current) return;

        isLoading.current = true;
        loadMore().finally(() => {
          isLoading.current = false;
          cooldownRef.current = setTimeout(() => {
            cooldownRef.current = null;
          }, 500);
        });
      },
      {
        rootMargin: options?.rootMargin ?? "200px",
        threshold: options?.threshold ?? 0,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, [loadMore, options?.rootMargin, options?.threshold]);

  return { sentinelRef, isLoading };
}

interface InfiniteScrollSentinelProps {
  onIntersect: () => Promise<void>;
  hasMore: boolean;
  isLoading: boolean;
  options?: UseInfiniteScrollOptions;
}

export function InfiniteScrollSentinel({
  onIntersect,
  hasMore,
  isLoading,
  options,
}: InfiniteScrollSentinelProps) {
  const { sentinelRef } = useInfiniteScroll(hasMore ? onIntersect : async () => {}, options);

  return (
    <div ref={sentinelRef} className="py-6 flex items-center justify-center">
      {isLoading && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 text-[var(--accent)] animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Cargando mas productos...
          </span>
        </div>
      )}
      {!hasMore && !isLoading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
          No hay mas productos
        </p>
      )}
    </div>
  );
}
