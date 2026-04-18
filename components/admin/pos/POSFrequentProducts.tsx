"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface FrequentProduct {
  id: number;
  name: string;
  price: number;
  stock?: number | null;
  soldToday: number;
}

interface POSFrequentProductsProps {
  onAddToCart: (productId: number) => void;
  refreshKey?: number; // increment to refresh after a sale
}

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

export default function POSFrequentProducts({
  onAddToCart,
  refreshKey = 0,
}: POSFrequentProductsProps) {
  const [products, setProducts] = useState<FrequentProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFrequent = useCallback(async () => {
    try {
      const res = await fetch("/api/products/frecuentes?limit=8");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchFrequent();
  }, [fetchFrequent, refreshKey]);

  if (loading || products.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-[var(--rule-soft)] dark:border-card-border bg-[var(--data-warning-50)]/30 dark:bg-amber-950/10">
      <div className="flex items-center gap-1.5 mb-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-[var(--data-warning)]" />
        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
          Mas vendidos hoy
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {products.map((p) => {
          const outOfStock = p.stock != null && p.stock <= 0;
          return (
            <button
              key={p.id}
              onClick={() => !outOfStock && onAddToCart(p.id)}
              disabled={outOfStock}
              className={cn(
                "shrink-0 px-2 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5",
                outOfStock
                  ? "bg-gray-100 dark:bg-surface text-[var(--text-tertiary)] dark:text-muted cursor-not-allowed"
                  : "bg-white dark:bg-card border border-[var(--data-warning)] dark:border-[var(--data-warning)]/30 text-[var(--text-primary)] dark:text-foreground hover:border-primary hover:bg-primary/5"
              )}
            >
              <span className="truncate max-w-24">{p.name}</span>
              <span className="text-primary font-bold">{fmt(p.price)}</span>
              <span className="text-[length:var(--ts-2xs)] text-[var(--data-warning)] font-bold">
                x{p.soldToday}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
