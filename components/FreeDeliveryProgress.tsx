"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Truck, ShoppingCart, Sparkles, Plus } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useSettings } from "@/contexts/settings-context";
import { products } from "@/data/products";
import { cn } from "@/lib/utils";

export default function FreeDeliveryProgress() {
  const { total, count, items, addItem } = useCart();
  const { deliveryConfig } = useSettings();
  const FREE_DELIVERY_MIN = deliveryConfig.freeDeliveryMin;
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);

  const remaining = Math.max(FREE_DELIVERY_MIN - total, 0);

  // Find the cheapest product that fills the remaining gap (not already in cart)
  const suggestion = useMemo(() => {
    if (remaining <= 0) return null;
    const cartIds = new Set(items.map((i) => i.id));
    // First try: product whose price >= remaining (cheapest option that fills the gap)
    const candidates = products.filter((p) => !cartIds.has(p.id) && p.price >= remaining);
    if (candidates.length > 0) {
      return candidates.reduce((a, b) => (a.price < b.price ? a : b));
    }
    // Fallback: cheapest product overall (any help toward the goal)
    const fallback = products.filter((p) => !cartIds.has(p.id));
    if (fallback.length > 0) {
      return fallback.reduce((a, b) => (a.price < b.price ? a : b));
    }
    return null;
  }, [remaining, items]);

  if (!isClient || count === 0) return null;

  const progress = Math.min((total / FREE_DELIVERY_MIN) * 100, 100);
  const achieved = remaining <= 0;

  return (
    <div className="py-3 bg-white dark:bg-card border-y border-gray-100 dark:border-card-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all",
            achieved ? "bg-emerald-100 dark:bg-emerald-500/10" : "bg-primary/10"
          )}>
            {achieved ? (
              <Truck className="h-4 w-4 text-emerald-600" />
            ) : (
              <ShoppingCart className="h-4 w-4 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold text-foreground">
                {achieved ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    ¡Delivery gratis desbloqueado!
                  </span>
                ) : (
                  <>
                    Agrega <span className="text-primary">S/{remaining.toFixed(2)}</span> más para delivery gratis
                  </>
                )}
              </p>
              <span className="text-[10px] text-muted font-semibold shrink-0 ml-2">
                S/{total.toFixed(2)} / S/{FREE_DELIVERY_MIN}
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700 ease-out",
                  achieved
                    ? "bg-emerald-500"
                    : progress >= 70
                    ? "bg-secondary"
                    : "bg-primary"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Product suggestion to close the gap */}
            {!achieved && suggestion && (
              <button
                type="button"
                onClick={() => addItem(suggestion)}
                className="mt-1.5 flex items-center gap-2 w-full text-left group"
              >
                <span className="text-[10px] text-muted group-hover:text-primary transition-colors truncate">
                  💡 Agrega <strong className="text-foreground group-hover:text-primary">{suggestion.name}</strong> (S/{suggestion.price.toFixed(2)}) para llegar
                </span>
                <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                  <Plus className="h-3 w-3 text-primary" />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
