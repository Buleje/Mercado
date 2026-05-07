"use client";

/**
 * LastOrderBanner — "¿Quieres repetir tu último pedido?"
 *
 * Qué hace (Feynman): cuando el cliente entra a mi-cuenta y ya compró antes,
 * le mostramos su último pedido con un botón que lo pide igual — así no tiene
 * que buscar producto por producto. Es el "cafecito de siempre" digital.
 *
 * Fuente: /api/marketplace/mi-cuenta/pedidos (mismo endpoint que la pestaña
 * de pedidos, agarramos el más reciente). Si no hay pedidos o el cliente no
 * tiene teléfono, NO renderiza nada (degradación silenciosa).
 */

import Link from "next/link";
import { useCustomer } from "@/contexts/customer-context";
import { useCustomerOrders } from "@/hooks/use-customer-orders";
import ReorderButton from "@/components/marketplace/ReorderButton";

function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDays === 0) return "hoy";
    if (diffDays === 1) return "ayer";
    if (diffDays < 7) return `hace ${diffDays} días`;
    if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} semanas`;
    return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short" }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

export function LastOrderBanner() {
  const { customer } = useCustomer();
  const { orders } = useCustomerOrders();
  const last = orders[0] ?? null;

  // No cliente, o sin pedidos aún → no renderizamos (cuenta nueva no ve ruido).
  if (!customer?.phone || !last) return null;

  const firstItem = last.items?.[0]?.name;
  const preview =
    last.itemsCount === 1
      ? firstItem ?? "1 producto"
      : firstItem
      ? `${firstItem} y ${last.itemsCount - 1} más`
      : `${last.itemsCount} productos`;

  return (
    <section
      aria-label="Repetir último pedido"
      className="mb-6 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Tu último pedido · {formatRelativeDate(last.createdAt)}
        </p>
        <p className="mt-1 truncate text-sm text-[var(--text-primary)]">
          {preview}
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-tertiary)] tabular-nums">
          S/ {Number(last.total).toFixed(2)}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 sm:mt-0 shrink-0">
        <ReorderButton customerPhone={customer.phone} />
        <Link
          href="/marketplace/mi-cuenta/pedidos"
          className="inline-flex items-center rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          Ver todos
        </Link>
      </div>
    </section>
  );
}

export default LastOrderBanner;
