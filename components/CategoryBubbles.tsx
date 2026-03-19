"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { categories } from "@/data/products";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";

const realCategories = categories.filter((c) => c.id !== "todos");

export default function CategoryBubbles() {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 160 : -160, behavior: "smooth" });
  };

  return (
    <section
      ref={ref}
      className="py-8 sm:py-10 bg-white dark:bg-background"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h3 className="text-center text-lg sm:text-xl font-bold text-foreground mb-6">
          Explora por <span className="text-primary">Categoría</span>
        </h3>

        <div className="relative">
          {/* Left scroll button */}
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-card shadow-md border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors -translate-x-3"
            aria-label="Desplazar a la izquierda"
          >
            <ChevronLeft className="h-4 w-4 text-muted" />
          </button>

          <div
            ref={scrollRef}
            className="flex gap-4 sm:gap-6 overflow-x-auto pb-2 scrollbar-none justify-start sm:justify-center px-1"
          >
            {realCategories.map((cat, i) => (
              <Link
                key={cat.id}
                href={`/tienda/categoria/${cat.id}`}
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
              </Link>
            ))}
          </div>

          {/* Right scroll button */}
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-card shadow-md border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors translate-x-3"
            aria-label="Desplazar a la derecha"
          >
            <ChevronRight className="h-4 w-4 text-muted" />
          </button>
        </div>
      </div>
    </section>
  );
}
