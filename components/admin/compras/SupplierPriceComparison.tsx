"use client";

import { DataTable } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { formatCurrency, formatDate } from "@/lib/format";

type Comparacion = {
  supplierId: string;
  supplierName: string;
  lastPrice: number;
  lastDate: string;
  purchaseCount: number;
  isCheapest: boolean;
};

interface SupplierPriceComparisonProps {
  productId: number;
  productName: string;
}

export { QuotationComparator } from "./QuotationComparator";


function SkeletonTable() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-8 bg-[var(--rule-base)] rounded w-full" />
      <div className="h-6 bg-[var(--surface-sunken)] rounded w-full" />
      <div className="h-6 bg-[var(--surface-sunken)] rounded w-full" />
    </div>
  );
}

export default function SupplierPriceComparison({ productId, productName }: SupplierPriceComparisonProps) {
  const [comparaciones, setComparaciones] = useState<Comparacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/compras/precio-comparativo?productId=${productId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data) setComparaciones(data.comparaciones ?? []);
      })
      .catch((err) => console.warn("[SupplierPriceComparison] fetch failed:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) return <SkeletonTable />;

  if (comparaciones.length === 0) {
    return (
      <div className="text-center py-4">
        <AlertTriangle className="h-6 w-6 text-[var(--text-tertiary)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
          No hay historial de compras para{" "}
          <strong>
            <EnlacePanel cosa="producto" id={String(productId)} apariencia="heredada">{productName}</EnlacePanel>
          </strong>
        </p>
      </div>
    );
  }

  const minPrice = Math.min(...comparaciones.map((c) => c.lastPrice));

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
        Comparación de precios:{" "}
        <EnlacePanel cosa="producto" id={String(productId)} apariencia="heredada">{productName}</EnlacePanel>
      </h4>

      {comparaciones.length === 1 && (
        <div className="flex items-center gap-2 text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Solo has comprado a 1 proveedor. Considera cotizar con otros.
        </div>
      )}

      <div className="overflow-x-auto">
        <DataTable className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
              <th className="text-left py-2 px-2 text-sm font-bold text-[var(--text-secondary)] dark:text-muted">Proveedor</th>
              <th className="text-right py-2 px-2 text-sm font-bold text-[var(--text-secondary)] dark:text-muted">Último precio</th>
              <th className="text-right py-2 px-2 text-sm font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
              <th className="text-center py-2 px-2 text-sm font-bold text-[var(--text-secondary)] dark:text-muted"># Compras</th>
              <th className="text-right py-2 px-2 text-sm font-bold text-[var(--text-secondary)] dark:text-muted">vs Mejor</th>
            </tr>
          </thead>
          <tbody>
            {comparaciones.map((c) => {
              const diff = minPrice > 0 ? ((c.lastPrice - minPrice) / minPrice) * 100 : 0;
              return (
                <tr
                  key={c.supplierId}
                  className={cn(
                    "border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50 transition-colors",
                    c.isCheapest && "bg-primary/10 dark:bg-primary/15",
                  )}
                >
                  <td className="py-2 px-2 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    <EnlacePanel cosa="proveedor" id={c.supplierId} apariencia="heredada">{c.supplierName}</EnlacePanel>
                    {c.isCheapest && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 dark:bg-primary/15 px-1.5 py-0.5 rounded-full">
                        <TrendingDown className="h-2.5 w-2.5" /> Mejor precio
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    {formatCurrency(Number(c.lastPrice))}
                  </td>
                  <td className="py-2 px-2 text-right text-[var(--text-secondary)] dark:text-muted text-sm">
                    {formatDate(c.lastDate)}
                  </td>
                  <td className="py-2 px-2 text-center text-[var(--text-secondary)] dark:text-muted">
                    {c.purchaseCount}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {c.isCheapest ? (
                      <span className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-bold text-sm">Mejor</span>
                    ) : (
                      <span className="text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold text-sm flex items-center justify-end gap-0.5">
                        <TrendingUp className="h-3 w-3" /> +{diff.toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
