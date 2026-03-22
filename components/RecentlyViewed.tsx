"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Image from "next/image";
import { Clock, ShoppingCart, Package, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
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
  // Notify RecentlyViewed component to refresh its list
  window.dispatchEvent(new Event("bsm:productViewed"));
}

export default function RecentlyViewed() {
  const [items, setItems] = useState<Product[]>([]);
  const [scrollIdx, setScrollIdx] = useState(0);
  const { addItem, items: cartItems, updateQty } = useCart();
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

  const visibleCount = 6; // 6 on desktop
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
            className="flex transition-transform duration-400 ease-out gap-2"
            style={{ transform: `translateX(-${scrollIdx * (100 / visibleCount)}%)` }}
          >
            {items.map((product) => (
              <div
                key={product.id}
                className="shrink-0 w-[calc(33.333%-6px)] sm:w-[calc(25%-6px)] lg:w-[calc(16.666%-7px)]"
              >
                <div className="group bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                  <div className="relative aspect-square bg-gray-50 dark:bg-surface overflow-hidden">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        loading="lazy"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-300">
                        <Package className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <h3 className="text-xs font-medium text-foreground line-clamp-2 mb-1.5">{product.name}</h3>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-extrabold text-primary">S/{product.price.toFixed(2)}</span>
                      {(() => { const qty = cartItems.find(i => i.id === product.id)?.quantity ?? 0; return qty > 0 ? (
                        <div className="flex items-center gap-0.5 bg-primary rounded-full px-1 py-1 shrink-0">
                          <button onClick={() => updateQty(product.id, qty - 1)} className="h-7 w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Disminuir">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-white font-extrabold text-sm min-w-5 text-center">{qty}</span>
                          <button onClick={() => updateQty(product.id, qty + 1)} className="h-7 w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Aumentar">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { addItem(product); showToast(product.name, product.image); }}
                          className="flex items-center justify-center h-9 w-9 rounded-full bg-primary text-white hover:bg-primary-dark active:scale-95 shrink-0"
                          aria-label={`Agregar ${product.name}`}
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </button>
                      ); })()}
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
