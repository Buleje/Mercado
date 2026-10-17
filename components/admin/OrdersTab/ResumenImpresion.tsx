/**
 * Lo que sale en papel con «Imprimir» (menú de Pedidos y reparto): los pedidos
 * en marcha que pasan los filtros, en una tabla. En pantalla no se ve
 * (`hidden print:block`). Sale tal cual de `OrdersTab/index.tsx` al pasar la
 * pestaña a vistas (plan «panel unificado», 2026-10-09).
 *
 * El total es la suma de los totales que manda el servidor: es la cifra de la
 * hoja impresa, no un cálculo de cobro.
 */
import { DataTable, PageTitle } from "@buleje/design-system";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { DbOrder } from "@/lib/jsondb";
import { STATUS_LABELS } from "./types";

export function ResumenImpresion({ pedidos }: { pedidos: readonly DbOrder[] }) {
  const total = pedidos.reduce((s, o) => s + o.total, 0);
  return (
    <div className="hidden print:block print-orders-summary">
      {/* `as="h2"`: este título sólo existe para la impresión; como h1
          duplicaba el encabezado de la página para los lectores de pantalla. */}
      <PageTitle as="h2" className="text-[length:var(--ts-xl)] sm:text-[length:var(--ts-xl)] font-bold mb-1">Resumen de pedidos activos</PageTitle>
      <p className="text-xs text-[var(--text-secondary)] mb-4">
        {formatDateTime(new Date())} · {pedidos.length} pedidos · {formatCurrency(total)} total
      </p>
      <DataTable className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-900">
            <th className="text-left py-1 pr-2">ID</th>
            <th className="text-left py-1 pr-2">Cliente</th>
            <th className="text-left py-1 pr-2">Teléfono</th>
            <th className="text-left py-1 pr-2">Estado</th>
            <th className="text-left py-1 pr-2">Productos</th>
            <th className="text-right py-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map(o => (
            <tr key={o.id} className="border-b border-[var(--rule-base)]">
              <td className="py-1.5 pr-2 font-mono">{o.id.slice(-6)}</td>
              <td className="py-1.5 pr-2">{o.customer.name}</td>
              <td className="py-1.5 pr-2">{o.customer.phone || "—"}</td>
              <td className="py-1.5 pr-2">{STATUS_LABELS[o.status]}</td>
              <td className="py-1.5 pr-2">{o.items.map(i => `${i.quantity}× ${i.name}`).join(", ")}</td>
              <td className="py-1.5 text-right font-semibold">{formatCurrency(Number(o.total))}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
