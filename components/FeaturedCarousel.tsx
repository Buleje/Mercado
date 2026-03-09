"use client";

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Star, Plus, Package } from "lucide-react";
import { products } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

const FEATURED = products.filter(p => p.badge === "Popular" || p.badge === "Oferta").slice(0, 8);
const INTERVAL = 4000;

function calc() {
  if (typeof window === "undefined") return 1;
  if (window.innerWidth >= 1024) return 3;
  if (window.innerWidth >= 640) return 2;
  return 1;
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function useVisibleCount() {
  return useSyncExternalStore(subscribeResize, calc, () => 1);
}

export default function FeaturedCarousel() {
  const [rawIdx, setIdx] = useState(0);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const n = FEATURED.length;
  const visibleCount = useVisibleCount();
  const maxIdx = Math.max(0, n - visibleCount);
  const idx = Math.min(rawIdx, maxIdx);
  const pausedRef = useRef(false);

  const next = useCallback(() => {
    if (pausedRef.current) return;
    setIdx(i => (i >= maxIdx ? 0 : i + 1));
  }, [maxIdx]);

  const prev = useCallback(() => setIdx(i => (i <= 0 ? maxIdx : i - 1)), [maxIdx]);

  useEffect(() => {
    const t = setInterval(next, INTERVAL);
    return () => clearInterval(t);
  }, [next]);

  if (n === 0) return null;

  return (
    <section className="py-8 sm:py-12" style={{ background: "linear-gradient(to bottom, rgba(45,106,79,0.05), transparent)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-secondary fill-secondary" />
            <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">Productos Destacados</h2>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={prev} aria-label="Anterior" className="h-8 w-8 rounded-full bg-white dark:bg-card border border-gray-200 dark:border-card-border flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-muted" />
            </button>
            <button onClick={next} aria-label="Siguiente" className="h-8 w-8 rounded-full bg-white dark:bg-card border border-gray-200 dark:border-card-border flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <ChevronRight className="h-4 w-4 text-gray-600 dark:text-muted" />
            </button>
          </div>
        </div>

        {/* Carousel track */}
        <div
          className="overflow-hidden rounded-2xl"
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
        >
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${idx * (100 / visibleCount)}%)` }}
          >
            {FEATURED.map(product => (
              <div
                key={product.id}
                className="shrink-0 px-1.5"
                style={{ width: `${100 / visibleCount}%` }}
              >
                <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
                  <div className="flex flex-col sm:flex-row">
                    <div className="relative aspect-square sm:w-40 shrink-0 bg-gray-50 dark:bg-surface">
                      {product.image ? (
                        <Image src={product.image} alt={product.name} fill className="object-cover" sizes="160px" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-8 w-8" /></div>
                      )}
                      {product.badge && (
                        <span className={cn(
                          "absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white",
                          product.badge === "Oferta" ? "bg-red-500" : product.badge === "Popular" ? "bg-secondary" : "bg-primary"
                        )}>
                          {product.badge}
                        </span>
                      )}
                    </div>
                    <div className="p-4 flex flex-col justify-between flex-1">
                      <div>
                        <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2">{product.name}</h3>
                        <p className="text-xs text-muted mt-1">por {product.unit}</p>
                      </div>
                      <div className="flex items-end justify-between mt-3">
                        <span className="text-lg font-extrabold text-primary">S/{product.price.toFixed(2)}</span>
                        <button
                          onClick={() => { addItem(product); showToast(product.name, product.image); }}
                          className="flex items-center gap-1 bg-primary text-white rounded-xl px-3 py-2 text-xs font-bold hover:bg-primary/90 active:scale-95 transition-all shadow-md"
                        >
                          <Plus className="h-3.5 w-3.5" /> Agregar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {Array.from({ length: maxIdx + 1 }).map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === idx ? "w-6 bg-primary" : "w-1.5 bg-gray-300 dark:bg-gray-600"
              )}
              aria-label={`Ir a posición ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
