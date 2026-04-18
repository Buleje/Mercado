"use client";

import { useEffect, useState, useCallback } from "react";
import { useCustomer } from "@/contexts/customer-context";
import ReorderButton from "@/components/marketplace/ReorderButton";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderSummary {
  id: string;
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  itemsCount: number;
  items: { name: string; quantity: number; unit: string }[];
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<OrderSummary["status"], string> = {
  pendiente:   "Pendiente",
  confirmado:  "Confirmado",
  en_camino:   "En camino",
  entregado:   "Entregado",
  cancelado:   "Cancelado",
};

const STATUS_STYLES: Record<OrderSummary["status"], string> = {
  pendiente:  "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  confirmado: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  en_camino:  "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  entregado:  "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelado:  "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PedidosPage() {
  const { customer } = useCustomer();
  const [orders, setOrders]   = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchOrders = useCallback(async (phone: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ phone, tenantId: "main" });
      const res = await fetch(`/api/marketplace/mi-cuenta/pedidos?${params}`);
      if (!res.ok) throw new Error("Error al cargar pedidos");
      const data = (await res.json()) as { orders: OrderSummary[] };
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch {
      setError("No se pudieron cargar los pedidos. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customer?.phone) {
      fetchOrders(customer.phone);
    } else {
      setLoading(false);
    }
  }, [customer?.phone, fetchOrders]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
          />
        ))}
        <span className="sr-only">Cargando pedidos...</span>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
      >
        {error}
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────

  if (orders.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Aun no tienes pedidos registrados.
        </p>
        <a
          href="/marketplace"
          className="mt-3 inline-block text-sm font-medium text-[#2d6a4f] hover:underline dark:text-[#52b788]"
        >
          Explorar tiendas
        </a>
      </div>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">
          Historial de pedidos
        </h2>
        {customer?.phone && (
          <ReorderButton customerPhone={customer.phone} />
        )}
      </div>

      <ul className="space-y-3" aria-label="Lista de pedidos">
        {orders.map((order) => (
          <li
            key={order.id}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDate(order.createdAt)}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {order.itemsCount === 1
                    ? "1 producto"
                    : `${order.itemsCount} productos`}
                  {order.items[0] ? ` — ${order.items[0].name}${order.itemsCount > 1 ? "..." : ""}` : ""}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  S/ {order.total.toFixed(2)}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_STYLES[order.status] ?? STATUS_STYLES.pendiente,
                  )}
                >
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
