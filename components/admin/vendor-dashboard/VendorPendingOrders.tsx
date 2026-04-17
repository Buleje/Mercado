"use client";

import type { VendorOrder } from "./vendor-dashboard.types";
import { Package, Clock, CheckCircle2 } from "lucide-react";
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
  if (status === "confirmado") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  return "bg-gray-100 text-gray-700";
}

export function VendorPendingOrders({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-6 ">
        <h3 className="font-bold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-[#f97316]" />
          Pedidos sin atender
        </h3>
        <div className="text-center py-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 text-emerald-600 dark:text-emerald-400 mb-2">
            <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Estás al día
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            No hay pedidos sin atender
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-6 ">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
          <Package className="h-5 w-5 text-[#f97316]" />
          Pedidos sin atender
          <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#f97316] text-white text-xs font-bold">
            {orders.length}
          </span>
        </h3>
        <Link
          href="/admin?tab=pedidos"
          className="text-xs font-semibold text-[#00B4A6] hover:underline"
        >
          Ver todos
        </Link>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-card-border">
        {orders.map((order) => (
          <li key={order.id} className="py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-gray-900 dark:text-foreground truncate">
                  {order.customer.name}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-muted mt-0.5 truncate">
                {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-3 w-3 text-gray-400" />
                <span className="text-xs text-gray-400">{timeAgo(order.createdAt)}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold text-sm text-gray-900 dark:text-foreground">
                S/ {order.total.toFixed(2)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
