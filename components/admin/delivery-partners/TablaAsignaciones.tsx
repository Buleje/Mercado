"use client";

/**
 * La tabla de Reparto › Asignaciones: qué pedido va con qué repartidor.
 * Sacada de `tabs/AsignacionesTab.tsx` el 17-10.
 *
 * 17-10 (P25): el nombre del repartidor y la fecha salían vacíos — la tabla
 * leía `partnerName` y `assignedAt`, que el servidor nunca manda (manda
 * `partner.name` y `createdAt`). Ahora además sale el cliente del pedido.
 */
import { DataTable } from "@buleje/design-system";
import { AlertCircle, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { toNum } from "@/components/admin/delivery-partners/shared";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";

export interface AsignacionFila {
  id: string;
  orderId: string;
  partnerId: string;
  status: string;
  fee: number | string;
  createdAt?: string;
  deliveredAt?: string | null;
  partner?: { id: string; name: string; phone?: string | null } | null;
  order?: { id: string; customerName?: string | null; total?: number | string | null } | null;
  /** Formas viejas, por si algún servidor todavía las manda. */
  partnerName?: string;
  assignedAt?: string;
}

const ESTADO_ASIGNACION: Record<string, { label: string; className: string }> = {
  assigned: { label: "Pendiente", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  accepted: { label: "Aceptado", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  picked_up: { label: "Recogido", className: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  in_transit: { label: "En camino", className: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  delivered: {
    label: "Entregado",
    className: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
  cancelled: { label: "Cancelado", className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
};

const nombreDe = (a: AsignacionFila) => a.partner?.name?.trim() || a.partnerName?.trim() || "Repartidor sin nombre";

export function TablaAsignaciones({ asignaciones, canceladas }: { asignaciones: AsignacionFila[]; canceladas: number }) {
  return (
    <>
      <div className="overflow-x-auto">
        <DataTable className="w-full">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Repartidor</th>
              <th className="text-right">Tarifa</th>
              <th className="text-center">Estado</th>
              <th className="text-right hidden sm:table-cell">Asignado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {asignaciones.map((a) => {
              const sc = ESTADO_ASIGNACION[a.status] ?? {
                label: a.status,
                className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
              };
              const nombre = nombreDe(a);
              const cliente = a.order?.customerName?.trim();
              const fecha = a.createdAt ?? a.assignedAt;
              return (
                <tr key={a.id}>
                  <td>
                    <span className="block font-mono font-extrabold">#{a.orderId.slice(-8)}</span>
                    {cliente && <span className="block text-sm text-[var(--text-secondary)]">{cliente}</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-extrabold shrink-0">
                        {nombre.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-[var(--text-primary)]">{nombre}</span>
                    </div>
                  </td>
                  <td className="text-right">
                    <span className="font-extrabold text-[var(--text-primary)] tabular-nums">{formatCurrency(toNum(a.fee))}</span>
                  </td>
                  <td className="text-center">
                    <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-sm font-bold", sc.className)}>{sc.label}</span>
                  </td>
                  <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell">
                    <span className="inline-flex items-center justify-end gap-1.5 font-bold">
                      <Clock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                      {fecha ? formatDateTimeShort(fecha) : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
      {canceladas > 0 && (
        <div className="px-6 py-3 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
          <p className="text-sm text-[var(--text-tertiary)] font-bold">
            <AlertCircle className="inline h-4 w-4 mr-1.5 -mt-0.5 text-[var(--data-error-500)]" aria-hidden />
            {canceladas} {canceladas === 1 ? "asignación cancelada" : "asignaciones canceladas"}
          </p>
        </div>
      )}
    </>
  );
}
