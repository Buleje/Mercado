"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { useStoreProducts } from "@/hooks/use-store-products";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";
import { getCategoryIcon } from "@/lib/category-icons";

export default function CategoryBubbles() {
  const { categories, isLoading } = useStoreProducts();
  const realCategories = categories.filter((c) => c.id !== "todos");
  const [ref, inView] = useInView({ threshold: 0.2 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    setCanScrollLeft(element.scrollLeft > 8);
    setCanScrollRight(maxScrollLeft - element.scrollLeft > 8);
  }, []);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 220 : -220, behavior: "smooth" });
  };

  useEffect(() => {
    updateScrollState();
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState]);

  if (isLoading || realCategories.length === 0) return null;

  return (
    <section
      ref={ref}
      className="pt-2 pb-4 sm:pt-3 sm:pb-5 bg-white dark:bg-background"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h3 className="text-center text-lg sm:text-xl font-bold text-foreground mb-4">
          Explora por <span className="text-primary">Categoría</span>
        </h3>

        <div className="relative">
          {/* Left scroll button */}
          <button
            onClick={() => scroll("left")}
            className={cn(
              "absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-md transition-all dark:border-card-border dark:bg-card/95",
              canScrollLeft ? "opacity-100" : "pointer-events-none opacity-35"
            )}
            aria-label="Desplazar a la izquierda"
          >
            <ChevronLeft className="h-4 w-4 text-muted" />
          </button>

          <div
            ref={scrollRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-10 pb-2 scrollbar-none"
          >
            {realCategories.map((cat, i) => {
              const Icon = getCategoryIcon(cat.id);
              return (
                <Link
                  key={cat.id}
                  href={`/tienda/categoria/${cat.id}`}
                  className={cn(
                    "group flex w-[4.9rem] shrink-0 snap-start flex-col items-center gap-2 transition-transform duration-300 hover:-translate-y-1 sm:w-22",
                    inView
                      ? "animate-[fadeUp_0.5s_ease-out_both]"
                      : "opacity-0"
                  )}
                  style={inView ? { animationDelay: `${i * 80}ms` } : undefined}
                  aria-label={`Ver ${cat.label}`}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-100 bg-surface transition-all duration-300 text-[var(--text-secondary)] group-hover:border-primary/30 group-hover:shadow-lg group-hover:text-[var(--accent)] dark:border-card-border dark:bg-card sm:h-20 sm:w-20">
                    <Icon size={44} className="transition-transform group-hover:scale-110 sm:h-14 sm:w-14" />
                  </div>
                  <span className="max-w-21 text-center text-xs font-medium leading-tight text-muted transition-colors group-hover:text-primary sm:max-w-20 sm:text-sm">
                    {cat.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Right scroll button */}
          <button
            onClick={() => scroll("right")}
            className={cn(
              "absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-md transition-all dark:border-card-border dark:bg-card/95",
              canScrollRight ? "opacity-100" : "pointer-events-none opacity-35"
            )}
            aria-label="Desplazar a la derecha"
          >
            <ChevronRight className="h-4 w-4 text-muted" />
          </button>
        </div>
      </div>
    </section>
  );
}
