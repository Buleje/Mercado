"use client";

import type { VendorOrder } from "./vendor-dashboard.types";
import { Receipt } from "lucide-react";

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
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-6 ">
        <h3 className="font-bold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-[#00B4A6]" />
          Ventas recientes de hoy
        </h3>
        <div className="text-center py-8">
          <span className="text-3xl">🛒</span>
          <p className="mt-2 text-sm font-medium text-gray-600 dark:text-muted">
            Todavía no hay ventas registradas hoy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-6 ">
      <h3 className="font-bold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
        <Receipt className="h-5 w-5 text-[#00B4A6]" />
        Ventas recientes de hoy
      </h3>

      <ul className="divide-y divide-gray-100 dark:divide-card-border">
        {sales.map((sale) => (
          <li key={sale.id} className="py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-900 dark:text-foreground truncate">
                  {sale.customer.name}
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatHour(sale.createdAt)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-muted mt-0.5 truncate">
                {sale.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </p>
              <span className="text-xs text-gray-400">{paymentLabel(sale.paymentMethod)}</span>
            </div>
            <div className="shrink-0">
              <p className="font-bold text-sm text-[#00B4A6]">
                S/ {sale.total.toFixed(2)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
