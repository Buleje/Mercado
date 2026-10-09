"use client";

import { Calendar, ShoppingCart, TrendingUp, CreditCard } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import { fmt, fmtDate, type Resumen360 } from "@/components/admin/cliente360/cliente360-compartido";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

/** Indicadores: total gastado, pedidos, ticket y primera compra; plegables y recordados (`resumenKpis` es la línea plegada). Bloque de la ficha 360 (Customer360Tab). */
export default function FichaKpis({ ficha, resumen, abierto, panelId }: { ficha: Cliente360; resumen: Resumen360; abierto: boolean; panelId: string }) {
  const {
    orders,
  } = ficha;
  const { totalSpent, avgTicket, firstOrder } = resumen;
  return (
    <>
      {/* KPIs */}
      <div id={panelId} hidden={!abierto} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total gastado",  value: fmt(totalSpent),        icon: CreditCard,   color: "text-[var(--data-success-500)]" },
          { label: "Pedidos",        value: String(orders.length),  icon: ShoppingCart, color: "text-[var(--data-success-500)]" },
          { label: "Ticket prom.",   value: fmt(avgTicket),         icon: TrendingUp,   color: "text-[var(--text-secondary)]" },
          { label: "Primera compra", value: firstOrder ? fmtDate(firstOrder.createdAt) : "—", icon: Calendar, color: "text-[var(--data-warning-500)]" },
        ].map(k => (
          <m.div
            key={k.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-4"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <k.icon className={cn("h-3.5 w-3.5", k.color)} />
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            </div>
            <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{k.value}</p>
          </m.div>
        ))}
      </div>
    </>
  );
}
