"use client";

import { CardTitle } from "@buleje/design-system";
import type { VendorOrder } from "./vendor-dashboard.types";
import { Package, Clock, CheckCircle2 } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { formatCurrency } from "@/lib/format";

const A_LA_VISTA = 3;

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
  if (status === "pendiente") return "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
  if (status === "confirmado") return "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
  return "bg-[var(--rule-soft)] text-[var(--text-primary)]";
}

export function VendorPendingOrders({ orders }: Props) {
  const visibles = orders.slice(0, A_LA_VISTA);
  const resto = orders.length - visibles.length;
  if (orders.length === 0) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 ">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-2 flex items-center gap-2">
          <Package className="h-5 w-5 text-[var(--data-warning-500)]" />
          Pedidos sin atender
        </CardTitle>
        <div className="text-center py-4">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-2">
            <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
            Estás al día
          </p>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            No hay pedidos sin atender
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 ">
      <div className="flex items-center justify-between mb-2">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
          <Package className="h-5 w-5 text-[var(--data-warning-500)]" />
          Pedidos sin atender
          <span className="ml-1 inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm font-bold tabular-nums">
            {orders.length}
          </span>
        </CardTitle>
        <EnlacePanel apariencia="heredada"
          href="/admin?tab=pedidos"
          className="inline-flex h-12 items-center text-sm font-semibold text-[var(--accent-ink)] hover:underline"
        >
          {resto > 0 ? `Ver ${resto} más` : "Ver todos"}
        </EnlacePanel>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)] dark:divide-card-border">
        {visibles.map((order) => (
          <li key={order.id} className="py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                  {order.customer.name}
                </span>
                <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${statusColor(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5 truncate">
                {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span className="text-sm text-[var(--text-tertiary)]">{timeAgo(order.createdAt)}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {formatCurrency(Number(order.total))}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
