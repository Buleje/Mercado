"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { useStoreProducts } from "@/hooks/use-store-products";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";

export default function CategoryBubbles() {
  const { categories, isLoading } = useStoreProducts();
  const realCategories = categories.filter((c) => c.id !== "todos");
  const [ref, inView] = useInView({ threshold: 0.2 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const pathname = usePathname();
  // Tienda individual: prefijo /t/<slug> para no salir del contexto del
  // comerciante al filtrar por categoría.
  const tenantSlug = pathname?.match(/^\/t\/([^/]+)/)?.[1] ?? null;
  const buildCatHref = (id: string) =>
    tenantSlug ? `/t/${tenantSlug}/tienda/categoria/${id}` : `/tienda/categoria/${id}`;

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
          {/* Left scroll button — MK-11: h-10 w-10 (40px tap target) */}
          <button
            onClick={() => scroll("left")}
            className={cn(
              "absolute left-0 top-1/2 z-10 hidden sm:flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-md transition-all dark:border-card-border dark:bg-card/95",
              canScrollLeft ? "opacity-100" : "pointer-events-none opacity-35"
            )}
            aria-label="Desplazar a la izquierda"
          >
            <ChevronLeft className="h-4 w-4 text-muted" />
          </button>

          {/* MK-11: Mobile <640px → grid 3x2; desktop → scroll horizontal */}
          <div className="sm:hidden grid grid-cols-3 gap-2">
            {realCategories.slice(0, 6).map((cat, i) => (
              <Link
                key={cat.id}
                href={buildCatHref(cat.id)}
                className={cn(
                  "flex items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3 min-h-[44px] text-sm font-semibold text-[var(--text-secondary)] transition-all duration-200 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] text-center leading-tight",
                  inView ? "animate-[fadeUp_0.4s_ease-out_both]" : "opacity-0",
                )}
                style={inView ? { animationDelay: `${i * 50}ms` } : undefined}
                aria-label={`Ver ${cat.label}`}
              >
                {cat.label}
              </Link>
            ))}
          </div>

          {/* Desktop: scroll horizontal con snap */}
          <div
            ref={scrollRef}
            className="hidden sm:flex snap-x snap-mandatory gap-2.5 sm:gap-3 overflow-x-auto px-12 pb-2 scrollbar-none"
            onScroll={updateScrollState}
          >
            {realCategories.map((cat, i) => (
              <Link
                key={cat.id}
                href={buildCatHref(cat.id)}
                className={cn(
                  "group inline-flex shrink-0 snap-start items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-all duration-200 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] hover:-translate-y-0.5 sm:px-5 sm:py-3",
                  inView ? "animate-[fadeUp_0.4s_ease-out_both]" : "opacity-0",
                )}
                style={inView ? { animationDelay: `${i * 50}ms` } : undefined}
                aria-label={`Ver ${cat.label}`}
              >
                {cat.label}
              </Link>
            ))}
          </div>

          {/* Right scroll button — MK-11: h-10 w-10 */}
          <button
            onClick={() => scroll("right")}
            className={cn(
              "absolute right-0 top-1/2 z-10 hidden sm:flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-md transition-all dark:border-card-border dark:bg-card/95",
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
