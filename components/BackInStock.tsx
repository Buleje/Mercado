"use client";

import { useState, useEffect, startTransition } from "react";
import Image from "next/image";
import { BellRing, ShoppingCart, X } from "lucide-react";
import { products } from "@/data/products";
import { useCart } from "@/contexts/cart-context";

const STORAGE_KEY = "bsm-back-in-stock-notified";

/* Simulate a product that was out of stock and is now back */
function getBackInStockProduct() {
  const now = new Date();
  // Rotate which product is "back in stock" each day
  const dayHash = now.getFullYear() * 1000 + now.getMonth() * 31 + now.getDate();
  const idx = (dayHash * 3 + 7) % products.length;
  return products[idx];
}

export default function BackInStock() {
  const { addItem } = useCart();
  const [product, setProduct] = useState<typeof products[0] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const notified = localStorage.getItem(STORAGE_KEY);
    const today = new Date().toDateString();
    if (notified === today) return;

    const timer = setTimeout(() => {
      startTransition(() => setProduct(getBackInStockProduct()));
    }, 25_000);
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
            <BellRing className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-bounce" />
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">¡De nuevo en stock!</span>
          </div>
          <button type="button" onClick={dismiss} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex items-center gap-3 p-3">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-50 dark:bg-white/5 border border-border shrink-0">
            <Image src={product.image} alt={product.name} fill sizes="56px" className="object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground line-clamp-1">{product.name}</p>
            <p className="text-xs text-muted">{product.unit}</p>
            <p className="text-sm font-extrabold text-primary mt-0.5">S/{product.price.toFixed(2)}</p>
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
