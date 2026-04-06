"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, BarChart3, X } from "lucide-react";
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
        className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 px-3 py-2 rounded-lg transition-colors"
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" /> Comparar cotizaciones completas
          </h3>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Step 1: Select OCs */}
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase mb-2">Selecciona 2-3 OCs para comparar</p>
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
                      ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-bold"
                      : "border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface text-gray-700 dark:text-foreground",
                    !isSelected && selectedOCIds.length >= 3 && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <span className="font-semibold">{sup?.name || oc.supplierId}</span>
                  <span className="text-gray-400 ml-2">S/{oc.total.toFixed(2)} · {oc.items.length} items · {new Date(oc.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Comparison Table */}
        {selectedOCs.length < 2 ? (
          <p className="text-sm text-gray-400 dark:text-muted text-center py-6">Necesitas al menos 2 OCs para comparar</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-card-border">
                  <th className="text-left py-2 px-2 text-xs font-bold text-gray-500 dark:text-muted">Producto</th>
                  {selectedOCs.map(oc => (
                    <th key={oc.id} className="text-right py-2 px-2 text-xs font-bold text-gray-500 dark:text-muted">
                      {oc.supplierName}
                    </th>
                  ))}
                  <th className="text-center py-2 px-2 text-xs font-bold text-gray-500 dark:text-muted">Mejor</th>
                </tr>
              </thead>
              <tbody>
                {productIds.map(pid => {
                  const best = bestPerProduct[pid];
                  return (
                    <tr key={pid} className="border-b border-gray-100 dark:border-card-border/50">
                      <td className="py-2 px-2 text-gray-700 dark:text-foreground font-medium">{productNames[pid]}</td>
                      {selectedOCs.map(oc => {
                        const item = oc.items.find(i => i.productId === pid);
                        const isBest = best && best.ocId === oc.id;
                        return (
                          <td key={oc.id} className={cn("py-2 px-2 text-right font-semibold", isBest ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/10" : "text-gray-700 dark:text-foreground")}>
                            {item ? `S/ ${item.unitCost.toFixed(2)}` : "—"}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center">
                        {best && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {selectedOCs.find(oc => oc.id === best.ocId)?.supplierName?.split(" ")[0] ?? ""} ✓
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* TOTAL row */}
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-bold">
                  <td className="py-2 px-2 text-gray-900 dark:text-foreground">TOTAL</td>
                  {selectedOCs.map(oc => {
                    const total = ocTotals.find(t => t.id === oc.id)?.total ?? 0;
                    const isBest = oc.id === bestTotalOcId;
                    return (
                      <td key={oc.id} className={cn("py-2 px-2 text-right", isBest ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/10" : "text-gray-900 dark:text-foreground")}>
                        S/ {total.toFixed(2)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      {selectedOCs.find(oc => oc.id === bestTotalOcId)?.supplierName?.split(" ")[0] ?? ""} ✓
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Savings */}
            {savings > 0 && (
              <div className="mt-3 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5">
                <TrendingDown className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
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
      <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded w-full" />
      <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded w-full" />
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
        <AlertTriangle className="h-6 w-6 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-muted">
          No hay historial de compras para <strong>{productName}</strong>
        </p>
      </div>
    );
  }

  const minPrice = Math.min(...comparaciones.map((c) => c.lastPrice));

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
        Comparacion de precios: {productName}
      </h4>

      {comparaciones.length === 1 && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-lg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Solo has comprado a 1 proveedor. Considera cotizar con otros.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-card-border">
              <th className="text-left py-2 px-2 text-xs font-bold text-gray-500 dark:text-muted">Proveedor</th>
              <th className="text-right py-2 px-2 text-xs font-bold text-gray-500 dark:text-muted">Ultimo precio</th>
              <th className="text-right py-2 px-2 text-xs font-bold text-gray-500 dark:text-muted">Fecha</th>
              <th className="text-center py-2 px-2 text-xs font-bold text-gray-500 dark:text-muted"># Compras</th>
              <th className="text-right py-2 px-2 text-xs font-bold text-gray-500 dark:text-muted">vs Mejor</th>
            </tr>
          </thead>
          <tbody>
            {comparaciones.map((c) => {
              const diff = minPrice > 0 ? ((c.lastPrice - minPrice) / minPrice) * 100 : 0;
              return (
                <tr
                  key={c.supplierId}
                  className={cn(
                    "border-b border-gray-100 dark:border-card-border/50 transition-colors",
                    c.isCheapest && "bg-green-50 dark:bg-green-950/10",
                  )}
                >
                  <td className="py-2 px-2 font-semibold text-gray-900 dark:text-foreground">
                    {c.supplierName}
                    {c.isCheapest && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                        <TrendingDown className="h-2.5 w-2.5" /> Mejor precio
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-gray-900 dark:text-foreground">
                    S/ {c.lastPrice.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right text-gray-500 dark:text-muted text-xs">
                    {formatDate(c.lastDate)}
                  </td>
                  <td className="py-2 px-2 text-center text-gray-600 dark:text-muted">
                    {c.purchaseCount}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {c.isCheapest ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">Mejor</span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400 font-semibold text-xs flex items-center justify-end gap-0.5">
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
