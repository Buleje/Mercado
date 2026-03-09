"use client";

import { useEffect, useRef, useState } from "react";

export function useInView<T extends Element = HTMLDivElement>(
  options?: IntersectionObserverInit
) {
  const ref = useRef<T>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || isInView) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.1, rootMargin: "-80px", ...options });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isInView]);

  return [ref, isInView] as const;
}
