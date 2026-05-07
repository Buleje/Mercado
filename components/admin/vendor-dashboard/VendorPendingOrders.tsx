"use client";

import { CardTitle } from "@buleje/design-system";
import type { VendorOrder } from "./vendor-dashboard.types";
import { Package, Clock, CheckCircle2 } from "@buleje/design-system/icons";
import Link from "next/link";

type Props = {
  orders: VendorOrder[];
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function statusLabel(status: string): string {
  if (status === "pendiente") return "Pendiente";
  if (status === "confirmado") return "Confirmado";
  return status;
}

function statusColor(status: string): string {
  if (status === "pendiente") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  if (status === "confirmado") return "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]";
  return "bg-gray-100 text-[var(--text-primary)]";
}

export function VendorPendingOrders({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 ">
        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-[var(--data-warning-500)]" />
          Pedidos sin atender
        </CardTitle>
        <div className="text-center py-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-2">
            <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
            Estás al día
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            No hay pedidos sin atender
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 ">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground flex items-center gap-2">
          <Package className="h-5 w-5 text-[var(--data-warning-500)]" />
          Pedidos sin atender
          <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--data-warning-500)] text-white text-xs font-bold">
            {orders.length}
          </span>
        </CardTitle>
        <Link
          href="/admin?tab=pedidos"
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver todos
        </Link>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-card-border">
        {orders.map((order) => (
          <li key={order.id} className="py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-[var(--text-primary)] dark:text-foreground truncate">
                  {order.customer.name}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5 truncate">
                {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-3 w-3 text-[var(--text-tertiary)]" />
                <span className="text-xs text-[var(--text-tertiary)]">{timeAgo(order.createdAt)}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">
                S/ {order.total.toFixed(2)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
