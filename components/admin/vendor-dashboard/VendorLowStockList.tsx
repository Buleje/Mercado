"use client";

import { CardTitle } from "@buleje/design-system";
import type { VendorLowStockProduct } from "./vendor-dashboard.types";
import { AlertTriangle, Package } from "@buleje/design-system/icons";
import Image from "next/image";

type Props = {
  products: VendorLowStockProduct[];
};

function urgencyColor(stock: number | undefined): string {
  if (stock === undefined || stock === null) return "bg-gray-100 text-[var(--text-secondary)]";
  if (stock <= 0) return "bg-red-100 text-[var(--data-error-700)] dark:bg-red-900/30 dark:text-red-400";
  if (stock <= 2) return "bg-red-50 text-[var(--data-error-600)] dark:bg-red-900/20 dark:text-red-400";
  return "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400";
}

export function VendorLowStockList({ products }: Props) {
  if (products.length === 0) {
    return (
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 ">
        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)]" />
          Stock bajo
        </CardTitle>
        <div className="text-center py-8">
          <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-50)] flex items-center justify-center"><Package className="h-5 w-5 text-[var(--data-warning-500)]" /></div>
          <p className="mt-2 text-sm font-medium text-[var(--text-secondary)] dark:text-muted">
            Todo tu stock está en buen nivel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 ">
      <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)]" />
        Stock bajo
        <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--data-warning-500)] text-white text-xs font-bold">
          {products.length}
        </span>
      </CardTitle>

      <ul className="divide-y divide-gray-100 dark:divide-card-border">
        {products.map((p) => (
          <li key={p.id} className="py-3 flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-[var(--surface-sunken)] shrink-0">
              {p.image && typeof p.image === "string" && p.image.trim().length > 0 ? (
                <Image
                  src={p.image}
                  alt={p.name}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)] text-xs">
                  —
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground truncate">
                {p.name}
              </p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{p.category}</p>
            </div>

            <div className="shrink-0 text-right">
              <span className={`inline-flex items-center text-xs font-bold px-2 py-1 rounded-full ${urgencyColor(p.stock)}`}>
                {p.stock ?? 0} {p.unit}
              </span>
              {p.stockMin !== undefined && p.stockMin !== null && (
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">mín: {p.stockMin}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
