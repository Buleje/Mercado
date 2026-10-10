"use client";

import { CardTitle } from "@buleje/design-system";
import { TrendingUp } from "@buleje/design-system/icons";
import { formatMonth } from "@/lib/format";
import { fmt, type Resumen360 } from "@/components/admin/cliente360/cliente360-compartido";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Compras de los últimos 6 meses. Bloque de la ficha 360 (Customer360Tab). */
export default function FichaComprasMeses({ ficha, resumen }: { ficha: Cliente360; resumen: Resumen360 }) {
  const {
    orders,
  } = ficha;
  const { totalSpent, avgTicket } = resumen;
  return (
    <>
      {/* Mejora 9: Purchase chart mini (last 6 months) */}
      {orders.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: "var(--accent)" }} /> Compras ultimos 6 meses
          </CardTitle>
          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {(() => {
              const months: Record<string, number> = {};
              const now = new Date();
              for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                months[key] = 0;
              }
              for (const o of orders) {
                const d = new Date(o.createdAt);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                if (key in months) months[key] += o.total;
              }
              const values = Object.values(months);
              const maxVal = Math.max(...values, 1);
              const labels = Object.keys(months);
              return labels.map((label, idx) => {
                const val = values[idx];
                const height = Math.max(4, (val / maxVal) * 64);
                const monthName = formatMonth(label + "-01");
                return (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1" title={`${monthName}: S/${val.toFixed(0)}`}>
                    <div className="w-full max-w-[28px] rounded-t" style={{ height, backgroundColor: "var(--accent)", opacity: val > 0 ? 1 : 0.2 }} />
                    <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">{monthName}</span>
                  </div>
                );
              });
            })()}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-secondary)] dark:text-muted">
            <span>Total: <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(totalSpent)}</strong></span>
            <span>Promedio: <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(avgTicket)}</strong></span>
            <span>Pedidos: <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{orders.length}</strong></span>
          </div>
        </div>
      )}
    </>
  );
}
