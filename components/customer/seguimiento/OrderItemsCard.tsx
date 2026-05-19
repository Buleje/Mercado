"use client";

/**
 * OrderItemsCard — Productos del pedido con miniaturas y cantidades.
 */
import Image from "next/image";
import { Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { TrackingItem } from "@/lib/mocks/order-tracking.mock";

interface Props {
  items: TrackingItem[];
  total: number;
  paymentMethod?: "yape" | "efectivo";
  className?: string;
}

function fmtSoles(n: number): string {
  return `S/${n.toFixed(2)}`;
}

export function OrderItemsCard({ items, total, paymentMethod, className }: Props) {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const hasDiscount = Math.abs(total - subtotal) > 0.01;

  return (
    <section
      aria-labelledby="tracking-items-heading"
      className={cn(
        "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
            Productos
          </span>
          <h2
            id="tracking-items-heading"
            className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-primary)] mt-0.5"
          >
            {items.length} {items.length === 1 ? "producto" : "productos"}
          </h2>
        </div>
        {paymentMethod && (
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted bg-[var(--surface-alt)] dark:bg-surface rounded-full px-2 py-1">
            {paymentMethod === "yape" ? "Yape" : "Efectivo"}
          </span>
        )}
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-card-border">
        {items.map((item) => (
          <li
            key={item.productId}
            className="py-3 first:pt-0 last:pb-0 flex items-center gap-3"
          >
            <div className="h-12 w-12 shrink-0 rounded-xl bg-[var(--surface-alt)] dark:bg-surface border border-[var(--rule-base)] overflow-hidden flex items-center justify-center">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <Package className="h-5 w-5 text-muted" strokeWidth={1.5} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {item.name}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5 tabular-nums">
                {item.quantity} {item.unit} · {fmtSoles(item.price)} c/u
              </p>
            </div>
            <span className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums shrink-0">
              {fmtSoles(item.price * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-4 border-t border-[var(--rule-base)] space-y-1.5">
        {hasDiscount && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmtSoles(subtotal)}</span>
          </div>
        )}
        {hasDiscount && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Descuentos</span>
            <span className="tabular-nums">-{fmtSoles(subtotal - total)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1.5">
          <span className="text-sm font-bold text-[var(--text-primary)]">Total</span>
          <span className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
            {fmtSoles(total)}
          </span>
        </div>
      </div>
    </section>
  );
}
