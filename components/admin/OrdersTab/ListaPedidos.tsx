"use client";

/**
 * Pedidos y reparto › Lista: los mismos pedidos en marcha que el tablero, en
 * una tabla (`?vista=lista`). Antes el panel sólo tenía el tablero; con muchos
 * pedidos la tabla se lee de corrido y se ordena por la cabeza que importa.
 *
 * Los filtros son los de la barra de arriba (el mismo estado que el tablero).
 * En el celular la tabla se vuelve tarjetas sola (`useMobileTableCards`).
 */
import { DataTable } from "@buleje/design-system";
import { ShoppingBasket } from "@buleje/design-system/icons";
import { EmptyState } from "@/components/admin/EmptyState";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import type { DbOrder } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_LABELS } from "./types";

const PAGO: Record<string, string> = { yape: "Yape", efectivo: "Efectivo", tarjeta: "Tarjeta", plin: "Plin" };

/** El mismo estilo de cabecera que Archivados: una sola tabla de pedidos en el panel. */
const TH = "text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] dark:text-muted";

interface ListaPedidosProps {
  pedidos: readonly DbOrder[];
  loading: boolean;
  onSelectOrder: (order: DbOrder) => void;
}

export function ListaPedidos({ pedidos, loading, onSelectOrder }: ListaPedidosProps) {
  if (loading) return <TableSkeleton rows={6} cols={7} />;
  if (pedidos.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBasket className="h-10 w-10 text-[var(--text-tertiary)]" />}
        title="No hay pedidos en marcha con estos filtros"
        actions={[]}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] dark:border-card-border">
      <DataTable className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)] dark:border-card-border">
          <tr>
            <th className={TH}>Pedido</th>
            <th className={TH}>Cliente</th>
            <th className={TH}>Estado</th>
            <th className={TH}>Pago</th>
            <th className={TH}>Repartidor</th>
            <th className={TH}>Hora</th>
            <th className={cn(TH, "text-right")}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {pedidos.map((o) => {
            const repartidor = (o as DbOrder & { deliveryDriver?: string }).deliveryDriver;
            return (
              <tr
                key={o.id}
                className="cursor-pointer hover:bg-[var(--surface-sunken)]"
                onClick={() => onSelectOrder(o)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectOrder(o);
                  }
                }}
                aria-label={`Ver pedido de ${o.customer.name}`}
              >
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">#{o.id.slice(-6)}</td>
                <td className="px-4 py-3">
                  <div className="min-w-0">
                  <span className="block font-semibold text-[var(--text-primary)]">
                    <EnlacePanel cosa="cliente" id={o.customer.phone}>{o.customer.name}</EnlacePanel>
                  </span>
                  {o.customer.phone && <span className="block font-mono text-xs text-[var(--text-tertiary)]">{o.customer.phone}</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", STATUS_COLORS[o.status])}>
                    {STATUS_LABELS[o.status]}
                  </span>
                  {o.deuda === true && <span className="ml-1.5 text-xs font-semibold text-[var(--data-warning-ink)]">con deuda</span>}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{(o.paymentMethod && PAGO[o.paymentMethod]) || o.paymentMethod || "—"}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{repartidor || "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-[var(--text-secondary)]">{formatDateTimeShort(o.createdAt)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">
                  {formatCurrency(Number(o.total))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
