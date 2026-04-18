"use client";

/**
 * TiendaPreviewOrders — DataTable del DS con los últimos 5 pedidos mock.
 * Muestra status, cliente, items, total, hora.
 */

import { DataTable, BadgeStatus } from "@buleje/design-system";
import { MessageCircle, Eye } from "@buleje/design-system/icons";

type OrderStatus = "preparing" | "delivered" | "pending_payment" | "canceled";

const MOCK_ORDERS: ReadonlyArray<{
  id: string;
  customer: string;
  items: number;
  total: string;
  hora: string;
  status: OrderStatus;
}> = [
  {
    id: "B-2401",
    customer: "María Gómez",
    items: 8,
    total: "S/ 78.50",
    hora: "hace 4 min",
    status: "preparing",
  },
  {
    id: "B-2400",
    customer: "Carlos Ramírez",
    items: 3,
    total: "S/ 42.00",
    hora: "hace 18 min",
    status: "preparing",
  },
  {
    id: "B-2399",
    customer: "Rosa Huamán",
    items: 12,
    total: "S/ 134.80",
    hora: "hace 1 h",
    status: "delivered",
  },
  {
    id: "B-2398",
    customer: "Pedro Dávila",
    items: 5,
    total: "S/ 55.30",
    hora: "hace 2 h",
    status: "pending_payment",
  },
  {
    id: "B-2397",
    customer: "Lucía Vega",
    items: 4,
    total: "S/ 38.00",
    hora: "hace 3 h",
    status: "delivered",
  },
];

const STATUS_LABELS: Record<OrderStatus, { label: string; variant: "success" | "warning" | "info" | "error" }> = {
  preparing: { label: "Preparando", variant: "warning" },
  delivered: { label: "Entregado", variant: "success" },
  pending_payment: { label: "Por cobrar", variant: "info" },
  canceled: { label: "Cancelado", variant: "error" },
};

export default function TiendaPreviewOrders() {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Últimos pedidos
        </h2>
        <a
          href="/admin/orders"
          className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Ver todos →
        </a>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th scope="col">Pedido</th>
            <th scope="col">Cliente</th>
            <th scope="col" className="text-right">
              Ítems
            </th>
            <th scope="col" className="text-right">
              Total
            </th>
            <th scope="col">Estado</th>
            <th scope="col">Cuándo</th>
            <th scope="col" className="text-right">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {MOCK_ORDERS.map((o) => {
            const s = STATUS_LABELS[o.status];
            return (
              <tr key={o.id}>
                <td className="font-mono font-semibold">{o.id}</td>
                <td>{o.customer}</td>
                <td className="text-right tabular-nums">{o.items}</td>
                <td className="text-right font-semibold tabular-nums">
                  {o.total}
                </td>
                <td>
                  <BadgeStatus variant={s.variant} label={s.label} />
                </td>
                <td className="text-[var(--text-tertiary)]">{o.hora}</td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      aria-label={`Ver detalle del pedido ${o.id}`}
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      aria-label={`Contactar cliente de ${o.id} por WhatsApp`}
                    >
                      <MessageCircle
                        className="h-3.5 w-3.5"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </section>
  );
}
