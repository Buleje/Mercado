"use client";

import { ShoppingCart } from "@buleje/design-system/icons";
import type { CartItem } from "@/contexts/cart-context";
import { formatCurrency } from "@/lib/utils";

/**
 * MiniCartSummary — `<details>` collapsible que muestra el carrito
 * resumido. Solo se renderiza en los pasos cuenta y datos.
 */

export type MiniCartSummaryProps = {
  items: CartItem[];
  finalTotal: number;
};

export function MiniCartSummary({ items, finalTotal }: MiniCartSummaryProps) {
  if (items.length === 0) return null;
  return (
    <details className="mx-5 mt-2 mb-0 group">
      <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-semibold text-primary py-1.5 px-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors">
        <span className="flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5" />
          {items.length} {items.length === 1 ? "producto" : "productos"} · {formatCurrency(finalTotal)}
        </span>
        <svg
          className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </summary>
      <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-[var(--rule-base)] divide-y divide-gray-50 dark:divide-card-border">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between px-3 py-1.5 text-xs"
          >
            <span className="text-gray-700 dark:text-[var(--text-primary)] truncate flex-1 min-w-0">
              {item.quantity}× {item.name}
            </span>
            <span className="text-gray-500 font-semibold ml-2 shrink-0">
              {formatCurrency(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
