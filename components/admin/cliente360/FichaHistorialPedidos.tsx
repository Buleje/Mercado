"use client";

import { CardTitle, DataTable } from "@buleje/design-system";
import { Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmt, fmtDate, STATUS_CONFIG } from "@/components/admin/cliente360/cliente360-compartido";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Historial de los últimos 10 pedidos. Bloque de la ficha 360 (Customer360Tab). */
export default function FichaHistorialPedidos({ ficha }: { ficha: Cliente360 }) {
  const {
    orders,
  } = ficha;
  return (
    <>
      {/* Historial de pedidos */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" /> Historial de pedidos
          <span className="text-xs text-[var(--text-tertiary)] font-normal ml-auto">{orders.length} total</span>
        </CardTitle>
        {orders.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted py-4 text-center">Sin pedidos registrados</p>
        ) : (
          <DataTable className="min-w-[500px]">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Items</th>
                  <th className="text-right">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...orders]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 10)
                  .map(o => {
                    const st = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pendiente;
                    const Icon = st.Icon;
                    return (
                      <tr key={o.id}>
                        <td className="font-mono text-xs text-[var(--text-secondary)] dark:text-muted">#{o.id.slice(-6).toUpperCase()}</td>
                        <td className="text-xs text-[var(--text-secondary)] dark:text-muted">{fmtDate(o.createdAt)}</td>
                        <td className="text-xs text-[var(--text-secondary)] dark:text-muted">{o.items.length} prod.</td>
                        <td className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-right">{fmt(o.total)}</td>
                        <td>
                          <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>
                            <Icon className="h-2.5 w-2.5" />{st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
          </DataTable>
        )}
      </div>
    </>
  );
}
