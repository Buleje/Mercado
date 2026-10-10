"use client";

/**
 * Pedidos de hoy (pestaña Marketplace del Inicio): quién pidió, qué, cuánto y
 * en qué estado va. El endpoint trae los 5 últimos del día EN CUALQUIER estado
 * (`OrdersDB.getRecent`), por eso ya no se titula «Ventas recientes de hoy» ni
 * se suma: un cancelado no es una venta.
 *
 * 2026-10-09: sin pedidos hoy no se dibuja (regla R2). Soles con el formato del
 * tablero y el medio de pago con su nombre (antes sólo Yape y Efectivo).
 */

import { CardTitle } from "@buleje/design-system";
import { Receipt } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { formatTime } from "@/lib/format";
import { cantidad, soles } from "@/lib/admin/inicio/formato-tablero";
import type { VendorOrder } from "./vendor-dashboard.types";

type Props = {
  sales: VendorOrder[];
};

const MEDIOS_DE_PAGO: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
};

const ESTADOS: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

function medioDePago(method?: string): string | null {
  if (!method) return null;
  return MEDIOS_DE_PAGO[method.toLowerCase()] ?? method;
}

export function VendorRecentSales({ sales }: Props) {
  if (sales.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Receipt className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
          Pedidos de hoy
        </CardTitle>
        <EnlacePanel apariencia="heredada" href="/admin?tab=pedidos" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline">
          Ver pedidos
        </EnlacePanel>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)]">
        {sales.map((sale) => {
          const detalle = [ESTADOS[sale.status] ?? sale.status, medioDePago(sale.paymentMethod)].filter(Boolean).join(" · ");
          return (
            <li key={sale.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{sale.customer.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">{formatTime(sale.createdAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                  {sale.items.map((i) => `${cantidad(i.quantity)}× ${i.name}`).join(", ")}
                </p>
                {detalle && <span className="text-xs text-[var(--text-tertiary)]">{detalle}</span>}
              </div>
              <p
                className={`shrink-0 text-sm font-extrabold tabular-nums ${sale.status === "cancelado" ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"}`}
              >
                {soles(sale.total)}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
