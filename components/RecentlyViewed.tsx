"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import Image from "next/image";
import { Clock, ShoppingCart, Package, ChevronLeft, ChevronRight, Minus, Plus, X } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import type { Product } from "@/data/products";

const STORAGE_KEY = "buleje-recently-viewed";
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
  window.dispatchEvent(new Event("buleje:productViewed"));
}

export default function RecentlyViewed() {
  const [items, setItems] = useState<Product[]>([]);
  const [scrollIdx, setScrollIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  const { addItem, items: cartItems, updateQty } = useCart();
  const { showToast } = useToast();

  useEffect(() => {
    // Load from localStorage, then validate against the DB
    const stored = getRecent();
    startTransition(() => setItems(stored));
    // Fade-in after mount
    requestAnimationFrame(() => setMounted(true));

    // Validate that recently-viewed products still exist in DB
    if (stored.length > 0) {
      fetch("/api/products?ids=" + stored.map(p => p.id).join(","))
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const products: { id: number }[] = Array.isArray(data) ? data : (data.data ?? data.products ?? []);
          const validIds = new Set(products.map((p: { id: number }) => p.id));
          const cleaned = stored.filter(p => validIds.has(p.id));
          if (cleaned.length !== stored.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
            startTransition(() => setItems(cleaned));
          }
        })
        .catch(() => { /* silently ignore validation errors */ });
    }

    // Re-check when product is viewed (custom event)
    const handler = () => startTransition(() => setItems(getRecent()));
    window.addEventListener("buleje:productViewed", handler);
    return () => window.removeEventListener("buleje:productViewed", handler);
  }, []);

  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  }, []);

  const removeItem = useCallback((productId: number) => {
    const updated = getRecent().filter(p => p.id !== productId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    startTransition(() => setItems(updated));
  }, []);

  if (items.length === 0) return null;

  const visibleCount = 6; // 6 on desktop
  const maxScroll = Math.max(0, items.length - visibleCount);

  return (
    <section
      className="py-10 sm:py-14 bg-white dark:bg-background transition-opacity duration-500"
      style={{ opacity: mounted ? 1 : 0 }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">Vistos recientemente</h2>
            <span className="text-xs text-muted font-medium">({items.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScrollIdx(i => Math.max(0, i - 1))}
              disabled={scrollIdx === 0}
              className="h-8 w-8 rounded-full bg-surface border border-[var(--rule-base)] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-30"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4 text-[var(--text-primary)]" />
            </button>
            <button
              onClick={() => setScrollIdx(i => Math.min(maxScroll, i + 1))}
              disabled={scrollIdx >= maxScroll}
              className="h-8 w-8 rounded-full bg-surface border border-[var(--rule-base)] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-30"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-4 w-4 text-[var(--text-primary)]" />
            </button>
            <button
              onClick={clearAll}
              className="text-xs text-muted hover:text-[var(--data-error-500)] transition-colors font-medium ml-1"
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
                <div className="group relative bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200">
                  {/* Remove button */}
                  <button
                    onClick={() => removeItem(product.id)}
                    className="absolute top-1.5 right-1.5 z-10 h-6 w-6 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                    aria-label={`Eliminar ${product.name} del historial`}
                  >
                    <X className="h-3 w-3" />
                  </button>
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
                    <h3 className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 mb-1.5">{product.name}</h3>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-extrabold text-primary">S/{Number(product.price).toFixed(2)}</span>
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
                          className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-primary text-white hover:bg-primary-dark active:scale-95 shrink-0"
                          aria-label={`Agregar ${product.name}`}
                        >
                          <ShoppingCart className="h-5 w-5" />
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
