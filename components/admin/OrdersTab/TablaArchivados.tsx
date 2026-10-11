"use client";

/**
 * La tabla de Archivados: cliente (con teléfono y dirección), estado, pago,
 * total y fecha con hora. «Ver en Maps» y «Eliminar» van al final, a 48 px.
 * En el celular la tabla se vuelve tarjetas sola (`useMobileTableCards`).
 */
import { MapPin, Trash2 } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { googleMapsUrl } from "@/lib/order-utils";
import type { DbOrder } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_LABELS, nombreDelPago } from "./types";

const TH = "text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] dark:text-muted";
const ACCION =
  "grid h-12 w-12 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

interface Props {
  pedidos: readonly DbOrder[];
  onSelectOrder: (order: DbOrder) => void;
  onDeleteOrder: (id: string) => void;
}

export function TablaArchivados({ pedidos, onSelectOrder, onDeleteOrder }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] dark:border-card-border">
      <DataTable className="w-full">
        <thead className="dark:border-card-border">
          <tr>
            <th className={TH}>Cliente</th>
            <th className={TH}>Estado</th>
            <th className={TH}>Pago</th>
            <th className={cn(TH, "text-right")}>Total</th>
            <th className={TH}>Fecha</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {pedidos.map((o) => (
            <tr
              key={o.id}
              className="cursor-pointer"
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
              <td>
                {/* Un solo hijo: en el celular la celda es flex y los <span> se montaban uno sobre otro. */}
                <div className="min-w-0">
                  <span className="block font-semibold text-[var(--text-primary)]">
                    <EnlacePanel cosa="cliente" id={o.customer.phone}>{o.customer.name}</EnlacePanel>
                  </span>
                  {o.customer.phone && <span className="block font-mono text-sm text-[var(--text-tertiary)]">{o.customer.phone}</span>}
                  {o.customer.location && (
                    <span className="block max-w-xs truncate text-sm text-[var(--text-secondary)]" title={o.customer.location}>
                      {o.customer.location}
                    </span>
                  )}
                </div>
              </td>
              <td>
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-sm font-bold", STATUS_COLORS[o.status])}>{STATUS_LABELS[o.status]}</span>
              </td>
              <td className="text-[var(--text-secondary)]">{nombreDelPago(o.paymentMethod) || "—"}</td>
              <td className="text-right font-semibold tabular-nums">{formatCurrency(Number(o.total))}</td>
              <td className="whitespace-nowrap text-[var(--text-secondary)]">{formatDateTimeShort(o.createdAt)}</td>
              <td>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={googleMapsUrl(o.customer.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(ACCION, "hover:bg-primary/10 hover:text-[var(--accent-ink)]")}
                    title="Ver en Maps"
                    aria-label={`Ver en Maps la dirección de ${o.customer.name}`}
                  >
                    <MapPin className="h-4 w-4" aria-hidden />
                  </a>
                  <button
                    type="button"
                    className={cn(ACCION, "hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-ink)]")}
                    title="Eliminar el pedido"
                    aria-label={`Eliminar el pedido de ${o.customer.name}`}
                    onClick={() => onDeleteOrder(o.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
