"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, BarChart3, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

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

// ── Mejora 16: Tipo para cotización completa ────────────────────────────────

type OCForComparison = {
  id: string;
  supplierId: string;
  supplierName: string;
  items: Array<{ productId: number; name: string; unitCost: number; quantity: number }>;
  total: number;
  createdAt: string;
};

/** Comparador de cotizaciones completas (Mejora 16) */
export function QuotationComparator({ orders, suppliers }: {
  orders: Array<{ id: string; supplierId: string; supplierName?: string; items: Array<{ productId: number; name: string; unitCost: number; quantity: number }>; total: number; createdAt: string; status: string }>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedOCIds, setSelectedOCIds] = useState<string[]>([]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--data-info-500)]/30 px-3 py-2 rounded-lg transition-colors"
      >
        <BarChart3 className="h-4 w-4" /> Comparar cotizaciones
      </button>
    );
  }

  const toggleOC = (id: string) => {
    setSelectedOCIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev; // Max 3
      return [...prev, id];
    });
  };

  const selectedOCs: OCForComparison[] = selectedOCIds
    .map(id => {
      const oc = orders.find(o => o.id === id);
      if (!oc) return null;
      const sup = suppliers.find(s => s.id === oc.supplierId);
      return { ...oc, supplierName: sup?.name || oc.supplierName || oc.supplierId } as OCForComparison;
    })
    .filter(Boolean) as OCForComparison[];

  // Build comparison table
  const allProductIds = new Set<number>();
  for (const oc of selectedOCs) {
    for (const item of oc.items) allProductIds.add(item.productId);
  }
  const productIds = Array.from(allProductIds);
  const productNames: Record<number, string> = {};
  for (const oc of selectedOCs) {
    for (const item of oc.items) { productNames[item.productId] = item.name; }
  }

  // Per-product best price
  const bestPerProduct: Record<number, { price: number; ocId: string }> = {};
  for (const pid of productIds) {
    let best = Infinity;
    let bestOcId = "";
    for (const oc of selectedOCs) {
      const item = oc.items.find(i => i.productId === pid);
      if (item && item.unitCost < best) { best = item.unitCost; bestOcId = oc.id; }
    }
    if (best < Infinity) bestPerProduct[pid] = { price: best, ocId: bestOcId };
  }

  // Totals
  const ocTotals = selectedOCs.map(oc => ({
    id: oc.id,
    total: oc.items.reduce((s, i) => s + i.unitCost * i.quantity, 0),
  }));
  const bestTotalOcId = ocTotals.length > 0 ? ocTotals.reduce((a, b) => a.total < b.total ? a : b).id : "";
  const worstTotal = ocTotals.length > 0 ? Math.max(...ocTotals.map(t => t.total)) : 0;
  const bestTotal = ocTotals.length > 0 ? Math.min(...ocTotals.map(t => t.total)) : 0;
  const savings = worstTotal - bestTotal;

  return (
    <div className="modal-backdrop p-4" onClick={() => setOpen(false)}>
      <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[var(--text-secondary)]" /> Comparar cotizaciones completas
          </CardTitle>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Step 1: Select OCs */}
        <div>
          <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase mb-2">Selecciona 2-3 OCs para comparar</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
            {orders.slice(0, 20).map(oc => {
              const sup = suppliers.find(s => s.id === oc.supplierId);
              const isSelected = selectedOCIds.includes(oc.id);
              return (
                <button
                  key={oc.id}
                  onClick={() => toggleOC(oc.id)}
                  disabled={!isSelected && selectedOCIds.length >= 3}
                  className={cn(
                    "text-left px-3 py-2 rounded-xl border text-xs transition-colors",
                    isSelected
                      ? "border-[var(--data-info-500)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]",
                    !isSelected && selectedOCIds.length >= 3 && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <span className="font-semibold">{sup?.name || oc.supplierId}</span>
                  <span className="text-[var(--text-tertiary)] ml-2">S/{Number(oc.total).toFixed(2)} · {oc.items.length} items · {new Date(oc.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Comparison Table */}
        {selectedOCs.length < 2 ? (
          <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-6">Necesitas al menos 2 OCs para comparar</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                  <th className="text-left py-2 px-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Producto</th>
                  {selectedOCs.map(oc => (
                    <th key={oc.id} className="text-right py-2 px-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                      {oc.supplierName}
                    </th>
                  ))}
                  <th className="text-center py-2 px-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Mejor</th>
                </tr>
              </thead>
              <tbody>
                {productIds.map(pid => {
                  const best = bestPerProduct[pid];
                  return (
                    <tr key={pid} className="border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50">
                      <td className="py-2 px-2 text-[var(--text-primary)] dark:text-[var(--text-primary)] font-medium">{productNames[pid]}</td>
                      {selectedOCs.map(oc => {
                        const item = oc.items.find(i => i.productId === pid);
                        const isBest = best && best.ocId === oc.id;
                        return (
                          <td key={oc.id} className={cn("py-2 px-2 text-right font-semibold", isBest ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>
                            {item ? `S/ ${Number(item.unitCost).toFixed(2)}` : "—"}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center">
                        {best && (
                          <span className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                            {selectedOCs.find(oc => oc.id === best.ocId)?.supplierName?.split(" ")[0] ?? ""} ✓
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* TOTAL row */}
                <tr className="border-t-2 border-[var(--rule-base)] dark:border-gray-600 font-bold">
                  <td className="py-2 px-2 text-[var(--text-primary)] dark:text-[var(--text-primary)]">TOTAL</td>
                  {selectedOCs.map(oc => {
                    const total = ocTotals.find(t => t.id === oc.id)?.total ?? 0;
                    const isBest = oc.id === bestTotalOcId;
                    return (
                      <td key={oc.id} className={cn("py-2 px-2 text-right", isBest ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>
                        S/ {total.toFixed(2)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center">
                    <span className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                      {selectedOCs.find(oc => oc.id === bestTotalOcId)?.supplierName?.split(" ")[0] ?? ""} ✓
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Savings */}
            {savings > 0 && (
              <div className="mt-3 flex items-center gap-2 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl px-4 py-2.5">
                <TrendingDown className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
                <span className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                  Ahorro vs mas caro: S/ {savings.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function SkeletonTable() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-full" />
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
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) return <SkeletonTable />;

  if (comparaciones.length === 0) {
    return (
      <div className="text-center py-4">
        <AlertTriangle className="h-6 w-6 text-[var(--text-tertiary)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
          No hay historial de compras para <strong>{productName}</strong>
        </p>
      </div>
    );
  }

  const minPrice = Math.min(...comparaciones.map((c) => c.lastPrice));

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
        Comparacion de precios: {productName}
      </h4>

      {comparaciones.length === 1 && (
        <div className="flex items-center gap-2 text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Solo has comprado a 1 proveedor. Considera cotizar con otros.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
              <th className="text-left py-2 px-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Proveedor</th>
              <th className="text-right py-2 px-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Último precio</th>
              <th className="text-right py-2 px-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
              <th className="text-center py-2 px-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted"># Compras</th>
              <th className="text-right py-2 px-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">vs Mejor</th>
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
                    c.isCheapest && "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
                  )}
                >
                  <td className="py-2 px-2 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    {c.supplierName}
                    {c.isCheapest && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-1.5 py-0.5 rounded-full">
                        <TrendingDown className="h-2.5 w-2.5" /> Mejor precio
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                    S/ {Number(c.lastPrice).toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right text-[var(--text-secondary)] dark:text-muted text-xs">
                    {formatDate(c.lastDate)}
                  </td>
                  <td className="py-2 px-2 text-center text-[var(--text-secondary)] dark:text-muted">
                    {c.purchaseCount}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {c.isCheapest ? (
                      <span className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-bold text-xs">Mejor</span>
                    ) : (
                      <span className="text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold text-xs flex items-center justify-end gap-0.5">
                        <TrendingUp className="h-3 w-3" /> +{diff.toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
