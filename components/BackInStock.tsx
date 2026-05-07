"use client";

import { useState, useEffect, startTransition } from "react";
import Image from "next/image";
import { BellRing, ShoppingCart, X, Package } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";

const STORAGE_KEY = "buleje-back-in-stock-notified";
const STOCK_CACHE_KEY = "buleje-stock-snapshot";

type StockProduct = {
  id: number;
  name: string;
  price: number;
  image: string;
  unit: string;
  stock?: number;
  category: string;
  active: boolean;
};

export default function BackInStock() {
  const { addItem } = useCart();
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const notified = localStorage.getItem(STORAGE_KEY);
    const today = new Date().toDateString();
    if (notified === today) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) return;
        const current: StockProduct[] = await res.json();
        if (!Array.isArray(current)) return;

        // Load previous stock snapshot
        let prev: Record<number, number> = {};
        try {
          const raw = localStorage.getItem(STOCK_CACHE_KEY);
          if (raw) prev = JSON.parse(raw);
        } catch { /* ignore */ }

        // Find products that were out of stock (0 or missing) and are now in stock
        const backInStock = current.filter(p =>
          p.active && (p.stock ?? 0) > 0 && (prev[p.id] ?? 0) === 0 && prev[p.id] !== undefined
        );

        // Save current snapshot for next comparison
        const snapshot: Record<number, number> = {};
        for (const p of current) snapshot[p.id] = p.stock ?? 0;
        localStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(snapshot));

        // Show the first back-in-stock product found
        if (backInStock.length > 0) {
          startTransition(() => setProduct(backInStock[0]));
        } else if (Object.keys(prev).length === 0) {
          // First visit — seed the snapshot but don't show notification
          return;
        }
      } catch { /* silent */ }
    }, 15_000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, new Date().toDateString());
  };

  const handleAdd = () => {
    if (product) {
      addItem(product);
      dismiss();
    }
  };

  if (!product || dismissed) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-4 z-40 max-w-xs w-full animate-[slideUp_0.4s_ease-out]">
      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-border">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[var(--data-success-600)] dark:text-emerald-400 animate-bounce" />
            <span className="text-xs font-bold text-[var(--data-success-700)] dark:text-emerald-400">¡De nuevo en stock!</span>
          </div>
          <button type="button" onClick={dismiss} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex items-center gap-3 p-3">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-50 dark:bg-white/5 border border-border shrink-0">
            {product.image
              ? <Image src={product.image} alt={product.name} fill sizes="56px" className="object-cover" />
              : <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-6 w-6" /></div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground line-clamp-1">{product.name}</p>
            <p className="text-xs text-muted">{product.unit}</p>
            <p className="text-sm font-extrabold text-primary mt-0.5">S/{Number(product.price).toFixed(2)}</p>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="bg-primary text-white rounded-xl p-2.5 hover:bg-primary/90 transition-colors shadow-sm shrink-0"
            aria-label="Agregar al carrito"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
