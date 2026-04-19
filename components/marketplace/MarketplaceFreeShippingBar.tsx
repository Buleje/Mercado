"use client";

import { useMemo } from "react";
import { Truck, CheckCircle2 } from "@buleje/design-system/icons";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const FREE_SHIPPING_THRESHOLD = 50;

export default function MarketplaceFreeShippingBar() {
  const { items } = useMarketplaceCart();

  const { subtotal, remaining, progress, unlocked } = useMemo(() => {
    const st = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    const rem = Math.max(FREE_SHIPPING_THRESHOLD - st, 0);
    const pr = Math.min(100, (st / FREE_SHIPPING_THRESHOLD) * 100);
    return {
      subtotal: st,
      remaining: rem,
      progress: pr,
      unlocked: st >= FREE_SHIPPING_THRESHOLD,
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-md",
        unlocked
          ? "bg-emerald-50/95 border-emerald-200 text-emerald-800"
          : "bg-white/95 border-gray-200 text-gray-800",
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center gap-3">
          {unlocked ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Truck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          )}

          <p className="text-xs sm:text-sm font-semibold flex-1">
            {unlocked ? (
              <>¡Tenés envío gratis! Tu subtotal supera los S/{FREE_SHIPPING_THRESHOLD}.</>
            ) : (
              <>
                Te faltan{" "}
                <strong className="text-primary tabular-nums">
                  <NumberFlow
                    value={remaining}
                    format={{ style: "currency", currency: "PEN", minimumFractionDigits: 2 }}
                    locales="es-PE"
                  />
                </strong>{" "}
                para envío gratis
              </>
            )}
          </p>

          <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums">
            <NumberFlow
              value={subtotal}
              format={{ style: "currency", currency: "PEN", minimumFractionDigits: 2 }}
              locales="es-PE"
            />
            <span className="text-gray-400"> / S/{FREE_SHIPPING_THRESHOLD}.00</span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500 rounded-full",
              unlocked
                ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                : "bg-gradient-to-r from-primary/60 to-primary",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
