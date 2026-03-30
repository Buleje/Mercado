"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Truck, ShoppingCart, Sparkles, Plus } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useSettings } from "@/contexts/settings-context";
import { useStoreProducts } from "@/hooks/use-store-products";
import { cn } from "@/lib/utils";

function MiniSparkles() {
  return (
    <span className="relative inline-flex items-center">
      <style>{`
        @keyframes sparkle1 { 0%,100% { transform: scale(0) rotate(0deg); opacity:0; } 50% { transform: scale(1) rotate(180deg); opacity:1; } }
        @keyframes sparkle2 { 0%,100% { transform: scale(0) rotate(0deg); opacity:0; } 60% { transform: scale(1.2) rotate(120deg); opacity:1; } }
        @keyframes sparkle3 { 0%,100% { transform: scale(0) rotate(0deg); opacity:0; } 40% { transform: scale(0.8) rotate(240deg); opacity:1; } }
      `}</style>
      <span className="absolute -top-1 -left-1 text-[8px]" style={{ animation: "sparkle1 1.5s ease-in-out infinite" }}>&#10022;</span>
      <span className="absolute -top-2 left-3 text-[6px] text-emerald-400" style={{ animation: "sparkle2 1.8s ease-in-out 0.3s infinite" }}>&#10022;</span>
      <span className="absolute top-0 left-6 text-[7px] text-yellow-400" style={{ animation: "sparkle3 2s ease-in-out 0.6s infinite" }}>&#10022;</span>
    </span>
  );
}

export default function FreeDeliveryProgress() {
  const { total, count, items, addItem } = useCart();
  const { deliveryConfig } = useSettings();
  const { products } = useStoreProducts();
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
  }, [remaining, items, products]);

  if (!isClient || count === 0) return null;

  const progress = Math.min((total / FREE_DELIVERY_MIN) * 100, 100);
  const achieved = remaining <= 0;

  return (
    <div className={cn(
      "py-3 border-y transition-colors duration-500",
      achieved
        ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800/30"
        : "bg-white dark:bg-card border-gray-100 dark:border-card-border"
    )}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-500",
            achieved ? "bg-emerald-100 dark:bg-emerald-500/15 animate-bounce" : "bg-primary/10"
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
                    <MiniSparkles />
                    <span className="ml-6">¡Delivery gratis desbloqueado!</span>
                  </span>
                ) : (
                  <>
                    Agrega <span className="text-primary font-extrabold">S/{remaining.toFixed(2)}</span> más para delivery gratis
                  </>
                )}
              </p>
              <span className="text-[10px] text-muted font-semibold shrink-0 ml-2">
                S/{total.toFixed(2)} / S/{FREE_DELIVERY_MIN}
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700 ease-out relative",
                  achieved
                    ? "bg-emerald-500"
                    : ""
                )}
                style={{
                  width: `${progress}%`,
                  ...(!achieved ? {
                    background: `linear-gradient(90deg, #f97316 0%, #0f766e ${Math.min(progress * 1.5, 100)}%)`,
                  } : {}),
                }}
              >
                {/* Shimmer effect on bar */}
                {!achieved && progress > 10 && (
                  <div className="absolute inset-0 overflow-hidden rounded-full">
                    <div className="absolute inset-0" style={{
                      background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                      animation: "shimmerBar 2s ease-in-out infinite",
                    }} />
                  </div>
                )}
              </div>
            </div>

            {/* Product suggestion to close the gap */}
            {!achieved && suggestion && (
              <button
                type="button"
                onClick={() => addItem(suggestion)}
                className="mt-1.5 flex items-center gap-2 w-full text-left group"
              >
                <span className="text-[10px] text-muted group-hover:text-primary transition-colors truncate">
                  Agrega <strong className="text-foreground group-hover:text-primary">{suggestion.name}</strong> (S/{suggestion.price.toFixed(2)}) para llegar
                </span>
                <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                  <Plus className="h-3 w-3 text-primary" />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shimmerBar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
