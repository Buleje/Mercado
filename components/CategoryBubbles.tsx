"use client";

import { useRef, useCallback } from "react";
import { categories } from "@/data/products";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";

const realCategories = categories.filter((c) => c.id !== "todos");

export default function CategoryBubbles() {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((categoryId: string) => {
    const el = document.getElementById("productos");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("bsm:selectCategory", { detail: categoryId })
        );
      }, 400);
    }
  }, []);

  return (
    <section
      ref={ref}
      className="py-8 sm:py-10 bg-white dark:bg-background"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h3 className="text-center text-lg sm:text-xl font-bold text-foreground mb-6">
          Explora por <span className="text-primary">Categoría</span>
        </h3>

        <div
          ref={scrollRef}
          className="flex gap-4 sm:gap-6 overflow-x-auto pb-2 scrollbar-none justify-start sm:justify-center"
        >
          {realCategories.map((cat, i) => (
            <button
              key={cat.id}
              onClick={() => handleClick(cat.id)}
              className={cn(
                "group flex flex-col items-center gap-2 shrink-0 transition-transform duration-300 hover:-translate-y-1",
                inView
                  ? "animate-[fadeUp_0.5s_ease-out_both]"
                  : "opacity-0"
              )}
              style={inView ? { animationDelay: `${i * 80}ms` } : undefined}
              aria-label={`Ver ${cat.label}`}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-surface dark:bg-card flex items-center justify-center border border-gray-100 dark:border-card-border group-hover:border-primary/30 group-hover:shadow-lg transition-all duration-300">
                <span className="text-3xl sm:text-4xl group-hover:scale-110 transition-transform">
                  {cat.emoji}
                </span>
              </div>
              <span className="text-xs sm:text-sm font-medium text-muted group-hover:text-primary transition-colors text-center leading-tight max-w-20">
                {cat.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
