"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Image from "next/image";
import { Clock, Plus, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import type { Product } from "@/data/products";

const STORAGE_KEY = "bsm-recently-viewed";
const MAX_ITEMS = 12;

// ── Persist recently viewed products ──────────────────────────────────────────
function getRecent(): Product[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

export function trackView(product: Product) {
  const items = getRecent().filter(p => p.id !== product.id);
  items.unshift(product);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export default function RecentlyViewed() {
  const [items, setItems] = useState<Product[]>([]);
  const [scrollIdx, setScrollIdx] = useState(0);
  const { addItem } = useCart();
  const { showToast } = useToast();

  useEffect(() => {
    startTransition(() => setItems(getRecent()));
    // Re-check when product is viewed (custom event)
    const handler = () => startTransition(() => setItems(getRecent()));
    window.addEventListener("bsm:productViewed", handler);
    return () => window.removeEventListener("bsm:productViewed", handler);
  }, []);

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  }, []);

  if (items.length === 0) return null;

  const visibleCount = 4; // We'll show 4 on desktop, CSS handles responsive
  const maxScroll = Math.max(0, items.length - visibleCount);

  return (
    <section className="py-10 sm:py-14 bg-white dark:bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">Vistos recientemente</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScrollIdx(i => Math.max(0, i - 1))}
              disabled={scrollIdx === 0}
              className="h-8 w-8 rounded-full bg-surface border border-gray-200 dark:border-card-border flex items-center justify-center hover:bg-gray-100 dark:hover:bg-card transition-colors disabled:opacity-30"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4 text-foreground" />
            </button>
            <button
              onClick={() => setScrollIdx(i => Math.min(maxScroll, i + 1))}
              disabled={scrollIdx >= maxScroll}
              className="h-8 w-8 rounded-full bg-surface border border-gray-200 dark:border-card-border flex items-center justify-center hover:bg-gray-100 dark:hover:bg-card transition-colors disabled:opacity-30"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-4 w-4 text-foreground" />
            </button>
            <button
              onClick={clearAll}
              className="text-xs text-muted hover:text-red-500 transition-colors font-medium ml-1"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl">
          <div
            className="flex transition-transform duration-400 ease-out gap-3"
            style={{ transform: `translateX(-${scrollIdx * (100 / visibleCount)}%)` }}
          >
            {items.map((product) => (
              <div
                key={product.id}
                className="shrink-0 w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)]"
              >
                <div className="group bg-surface dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden hover:shadow-md transition-all duration-200">
                  <div className="relative aspect-square bg-gray-50 dark:bg-surface overflow-hidden">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        loading="lazy"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-300">
                        <Package className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-1">{product.name}</h3>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-base font-extrabold text-primary">S/{product.price.toFixed(2)}</span>
                      <button
                        onClick={() => { addItem(product); showToast(product.name, product.image); }}
                        className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-white hover:bg-primary-dark active:scale-95 transition-all shadow-sm"
                        aria-label={`Agregar ${product.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
