"use client";

import { DataTable } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { ReceivedItem } from "./oc-recepcion-tipos";

/** Paso 2 de «Recibir la orden»: ajustar el precio de cada línea según la factura. */
export default function OCRecepcionPaso2({ receivedItems, totalFactura, updateItem }: {
  receivedItems: ReceivedItem[];
  totalFactura: number;
  updateItem: (idx: number, patch: Partial<ReceivedItem>) => void;
}) {
  return (
    <>
      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" />
        Ajustar precios segun factura
      </p>
      <div className="overflow-x-auto">
        <DataTable className="w-full">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-right">Precio anterior</th>
              <th className="text-center">Precio factura</th>
              <th className="text-right">Dif. %</th>
            </tr>
          </thead>
          <tbody>
            {receivedItems
              .filter((i) => i.receivedQty > 0)
              .map((item) => {
                const idx = receivedItems.findIndex((r) => r.productId === item.productId);
                const priceDiff =
                  item.originalPrice > 0
                    ? ((item.unitPrice - item.originalPrice) / item.originalPrice) * 100
                    : 0;
                const isSignificant = Math.abs(priceDiff) > 5;

                return (
                  <tr key={item.productId}>
                    <td className="font-semibold">
                      {item.name}
                    </td>
                    <td className="text-right text-[var(--text-secondary)] dark:text-muted">
                      {formatCurrency(Number(item.originalPrice))}
                    </td>
                    <td className="text-center">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unitPrice}
                        onChange={(e) => updateItem(idx, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                        aria-label={`Precio de factura de ${item.name}`}
                        className="w-24 text-center border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-2 py-1 text-sm font-bold bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                      />
                    </td>
                    <td className="text-right">
                      {priceDiff !== 0 && (
                        <span
                          className={cn(
                            "text-sm font-semibold flex items-center justify-end gap-0.5",
                            isSignificant ? "text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]",
                          )}
                        >
                          {isSignificant && <AlertTriangle className="h-3 w-3" />}
                          {priceDiff > 0 ? "+" : ""}{priceDiff.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </DataTable>
      </div>
      <div className="text-right">
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Total factura:</p>
        <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          {formatCurrency(totalFactura)}
        </p>
      </div>
    </>
  );
}
