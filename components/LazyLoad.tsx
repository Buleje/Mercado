"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";

/**
 * Defers rendering of children until the placeholder enters (or nears) the viewport.
 * Combined with next/dynamic, this prevents the JS chunk from even being fetched
 * until the user scrolls close to the section.
 */
export default function LazyLoad({
  children,
  rootMargin = "200px",
  fallback = null,
}: {
  children: ReactNode;
  rootMargin?: string;
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return <div ref={ref}>{visible ? children : fallback}</div>;
}
