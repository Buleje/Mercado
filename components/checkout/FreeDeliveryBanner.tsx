"use client";

import { Truck, Check } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/utils";

interface FreeDeliveryBannerProps {
  currentTotal: number;
  minAmount?: number; // default S/50
  deliveryCost?: number; // default S/5
}

/**
 * Banner that shows progress toward free delivery.
 * Place in cart sidebar or checkout flow.
 */
export function FreeDeliveryBanner({
  currentTotal,
  minAmount = 50,
  deliveryCost = 5,
}: FreeDeliveryBannerProps) {
  const remaining = minAmount - currentTotal;
  const isFree = remaining <= 0;
  const progress = Math.min(100, (currentTotal / minAmount) * 100);

  if (isFree) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
        <div className="h-7 w-7 rounded-full bg-[var(--data-success-500)] flex items-center justify-center shrink-0">
          <Check className="h-4 w-4 text-white" />
        </div>
        <p className="text-xs font-bold text-[var(--data-success-700)] dark:text-emerald-400">
          Delivery gratis aplicado
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 space-y-2">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-[var(--data-warning-600)] shrink-0" />
        <p className="text-xs text-[var(--data-warning-700)] dark:text-amber-400">
          <span className="font-bold">Agrega {formatCurrency(remaining)} mas</span> para delivery gratis
          <span className="text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"> (ahorras {formatCurrency(deliveryCost)})</span>
        </p>
      </div>
      <div className="h-1.5 bg-amber-200 dark:bg-amber-900/30 rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--data-warning-500)] rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
