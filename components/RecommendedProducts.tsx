"use client";

import { useEffect, useState, useRef } from "react";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { formatCurrency } from "@/lib/currency";
import type { Product } from "@/data/products";
import { ShoppingCart, Sparkles } from "lucide-react";

type RecProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
  unit: string;
};

export default function RecommendedProducts() {
  const { customer } = useCustomer();
  const { addItem } = useCart();
  const [products, setProducts] = useState<RecProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "10" });
        if (customer?.phone) params.set("phone", customer.phone);
        const res = await fetch(`/api/recommendations?${params}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setProducts(data);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [customer?.phone]);

  if (loading || products.length === 0) return null;

  const handleAdd = (p: RecProduct) => {
    addItem({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      image: p.image,
      unit: p.unit,
    } as Product);
  };

  return (
    <section className="py-10 px-4 bg-linear-to-b from-orange-50/60 to-white dark:from-orange-950/10 dark:to-background">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="h-5 w-5 text-orange-500" />
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">
            {customer?.phone ? "Te puede interesar" : "Los más vendidos"}
          </h2>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
        >
          {products.map((p) => (
            <div
              key={p.id}
              data-testid="product-card"
              className="snap-start shrink-0 w-44 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="aspect-square relative bg-gray-50 dark:bg-card">
                {p.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- External product images with dynamic URLs */
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl bg-gray-100 dark:bg-card">📦</div>
                )}
                <span className="absolute top-2 left-2 text-[10px] font-bold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-full">
                  {p.category}
                </span>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-sm font-bold text-gray-900 dark:text-foreground line-clamp-2 leading-tight">
                  {p.name}
                </p>
                <p className="text-xs text-gray-400 dark:text-muted">{p.unit}</p>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-extrabold text-orange-600 dark:text-orange-400">
                    {formatCurrency(p.price)}
                  </span>
                  <button
                    onClick={() => handleAdd(p)}
                    className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                    aria-label={`Agregar ${p.name} al carrito`}
                    title="Agregar al carrito"
                  >
                    <ShoppingCart className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
