"use client";

/**
 * PriceCompare — Comparador de precios entre tiendas.
 *
 * Muestra el mismo producto en diferentes tiendas con sus precios,
 * para que el cliente elija donde comprar mas barato.
 * Diferenciador #1 vs competencia en Pucallpa.
 */

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownUp, Store, TrendingDown, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StorePrice {
  storeSlug: string;
  storeName: string;
  storeLogo?: string;
  storeRating?: number;
  price: number;
  originalPrice?: number;
  inStock: boolean;
  deliveryAvailable?: boolean;
}

interface PriceCompareProps {
  productName: string;
  productId?: number;
  className?: string;
}

export function PriceCompare({ productName, productId, className }: PriceCompareProps) {
  const [prices, setPrices] = useState<StorePrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"price" | "rating">("price");

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (productId) params.set("productId", String(productId));
      else params.set("name", productName);

      const res = await fetch(`/api/marketplace/compare?${params}`);
      if (res.ok) {
        const json = await res.json();
        setPrices(json.data ?? []);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [productId, productName]);

  useEffect(() => {
    if (open && prices.length === 0) fetchPrices();
  }, [open, prices.length, fetchPrices]);

  const sorted = [...prices].sort((a, b) => {
    if (sortBy === "price") return a.price - b.price;
    return (b.storeRating ?? 0) - (a.storeRating ?? 0);
  });

  const cheapest = sorted[0]?.price ?? 0;
  const mostExpensive = sorted[sorted.length - 1]?.price ?? 0;
  const savings = mostExpensive - cheapest;

  return (
    <div className={cn("rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden", className)}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10 hover:from-primary/10 hover:to-secondary/10 transition-all"
      >
        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-gray-800 dark:text-foreground">
            Comparar precios
          </span>
          {prices.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
              {prices.length} tiendas
            </span>
          )}
        </div>
        {savings > 0 && (
          <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <TrendingDown className="h-3 w-3" />
            Ahorra S/ {savings.toFixed(2)}
          </span>
        )}
      </button>

      {/* Expandable content */}
      {open && (
        <div className="border-t border-gray-100 dark:border-card-border">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-gray-500">Buscando precios...</span>
            </div>
          ) : prices.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">
              No encontramos este producto en otras tiendas
            </div>
          ) : (
            <>
              {/* Sort toggle */}
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-surface">
                <span className="text-xs text-gray-400">Ordenar por:</span>
                <button
                  onClick={() => setSortBy("price")}
                  className={cn(
                    "text-xs font-semibold px-2 py-1 rounded-lg transition-colors",
                    sortBy === "price" ? "bg-primary/10 text-primary" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Precio
                </button>
                <button
                  onClick={() => setSortBy("rating")}
                  className={cn(
                    "text-xs font-semibold px-2 py-1 rounded-lg transition-colors",
                    sortBy === "rating" ? "bg-primary/10 text-primary" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  Rating
                </button>
              </div>

              {/* Price list */}
              <div className="divide-y divide-gray-50 dark:divide-card-border">
                {sorted.map((sp, i) => {
                  const isCheapest = i === 0 && sortBy === "price";
                  const discount = sp.originalPrice
                    ? Math.round((1 - sp.price / sp.originalPrice) * 100)
                    : 0;

                  return (
                    <Link
                      key={sp.storeSlug}
                      href={`/marketplace/${sp.storeSlug}`}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-accent transition-colors",
                        isCheapest && "bg-emerald-50/50 dark:bg-emerald-950/20"
                      )}
                    >
                      {/* Store icon */}
                      <div className="h-10 w-10 rounded-xl bg-gray-100 dark:bg-surface flex items-center justify-center shrink-0 overflow-hidden">
                        {sp.storeLogo ? (
                          <Image src={sp.storeLogo} alt={sp.storeName} width={40} height={40} className="object-cover" />
                        ) : (
                          <Store className="h-5 w-5 text-gray-400" />
                        )}
                      </div>

                      {/* Store info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-foreground truncate">
                          {sp.storeName}
                          {isCheapest && (
                            <span className="ml-1.5 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                              MEJOR PRECIO
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {sp.storeRating && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-500">
                              <Star className="h-3 w-3 fill-amber-400" />
                              {sp.storeRating.toFixed(1)}
                            </span>
                          )}
                          {!sp.inStock && (
                            <span className="text-[10px] text-red-500 font-semibold">Agotado</span>
                          )}
                          {sp.deliveryAvailable && (
                            <span className="text-[10px] text-primary font-semibold">Delivery</span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right shrink-0">
                        <p className={cn(
                          "text-base font-extrabold",
                          isCheapest ? "text-emerald-600 dark:text-emerald-400" : "text-gray-800 dark:text-foreground"
                        )}>
                          S/ {sp.price.toFixed(2)}
                        </p>
                        {discount > 0 && (
                          <p className="text-xs text-gray-400 line-through">
                            S/ {sp.originalPrice?.toFixed(2)}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
