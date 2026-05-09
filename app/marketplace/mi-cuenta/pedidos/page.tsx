"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useCustomer } from "@/contexts/customer-context";
import ReorderButton from "@/components/marketplace/ReorderButton";
import ReorderOrderButton from "@/components/marketplace/ReorderOrderButton";
import { EmptyState } from "@/components/ui-system/EmptyState";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image?: string | null;
}

interface OrderSummary {
  id: string;
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  itemsCount: number;
  storeSlug: string;
  items: OrderItem[];
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
  en_camino:  "bg-purple-50 text-[var(--accent)] dark:bg-purple-900/30 dark:text-purple-400",
  entregado:  "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelado:  "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-tertiary)]",
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
            className="h-20 animate-pulse rounded-lg bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)]"
          />
        ))}
        <span className="sr-only">Cargando pedidos...</span>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <EmptyState
        eyebrow="Conexión"
        title="No pudimos cargar tus pedidos"
        description={error}
        action={
          <button
            type="button"
            onClick={() => customer?.phone && fetchOrders(customer.phone)}
            className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Reintentar
          </button>
        }
        secondaryAction={
          <Link
            href="/marketplace"
            className="inline-flex items-center rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Ir al marketplace
          </Link>
        }
      />
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────

  if (orders.length === 0) {
    return (
      <EmptyState
        eyebrow="Pedidos"
        title="Aún no tienes pedidos"
        description="Cuando compres en una tienda, tu pedido aparecerá aquí con su estado actualizado en tiempo real."
        action={
          <Link
            href="/marketplace"
            className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Explorar tiendas
          </Link>
        }
        secondaryAction={
          !customer?.phone && (
            <Link
              href="/marketplace"
              className="inline-flex items-center rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Iniciar sesión
            </Link>
          )
        }
      />
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-medium text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]">
          Historial de pedidos
        </h2>
        {customer?.phone && (
          <ReorderButton customerPhone={customer.phone} />
        )}
      </div>

      <ul className="space-y-3" aria-label="Lista de pedidos">
        {orders.map((order) => {
          const canReorder = order.status !== "cancelado" && order.items.length > 0;
          return (
            <li
              key={order.id}
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--rule-base)] dark:bg-[var(--surface-canvas)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
                    {formatDate(order.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]">
                    {order.itemsCount === 1
                      ? "1 producto"
                      : `${order.itemsCount} productos`}
                    {order.items[0] ? ` — ${order.items[0].name}${order.itemsCount > 1 ? "..." : ""}` : ""}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    S/ {Number(order.total).toFixed(2)}
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

              {/* MK-28: re-pedir un click */}
              {canReorder && (
                <div className="mt-3 flex justify-end border-t border-gray-100 pt-3 dark:border-[var(--rule-soft)]">
                  <ReorderOrderButton
                    orderId={order.id}
                    storeSlug={order.storeSlug}
                    items={order.items}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
