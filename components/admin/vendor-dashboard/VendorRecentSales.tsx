"use client";

import { CardTitle } from "@buleje/design-system";
import type { VendorOrder } from "./vendor-dashboard.types";
import { Receipt, ShoppingCart } from "@buleje/design-system/icons";

type Props = {
  sales: VendorOrder[];
};

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function paymentLabel(method?: string): string {
  if (method === "yape") return "Yape";
  if (method === "efectivo") return "Efectivo";
  return "—";
}

export function VendorRecentSales({ sales }: Props) {
  if (sales.length === 0) {
    return (
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 ">
        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground mb-4 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Ventas recientes de hoy
        </CardTitle>
        <div className="text-center py-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mb-2">
            <ShoppingCart className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
            Sin ventas hoy
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Aún no registraste ninguna venta hoy
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 ">
      <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground mb-4 flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        Ventas recientes de hoy
      </CardTitle>

      <ul className="divide-y divide-gray-100 dark:divide-card-border">
        {sales.map((sale) => (
          <li key={sale.id} className="py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--text-primary)] dark:text-foreground truncate">
                  {sale.customer.name}
                </span>
                <span className="text-xs text-[var(--text-tertiary)] shrink-0">
                  {formatHour(sale.createdAt)}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5 truncate">
                {sale.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </p>
              <span className="text-xs text-[var(--text-tertiary)]">{paymentLabel(sale.paymentMethod)}</span>
            </div>
            <div className="shrink-0">
              <p className="font-bold text-sm text-primary">
                S/ {sale.total.toFixed(2)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
