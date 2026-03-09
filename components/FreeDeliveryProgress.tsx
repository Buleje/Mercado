"use client";

import { useSyncExternalStore } from "react";
import { Truck, ShoppingCart, Sparkles } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

const FREE_DELIVERY_MIN = 50; // S/50 for free delivery

export default function FreeDeliveryProgress() {
  const { total, count } = useCart();
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);

  if (!isClient || count === 0) return null;

  const progress = Math.min((total / FREE_DELIVERY_MIN) * 100, 100);
  const remaining = Math.max(FREE_DELIVERY_MIN - total, 0);
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
          </div>
        </div>
      </div>
    </div>
  );
}
