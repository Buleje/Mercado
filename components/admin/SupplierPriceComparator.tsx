"use client";
import { SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo } from "react";
import { ShoppingCart, TrendingDown, Loader2, AlertTriangle, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── Helpers ── */
const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

/* ── Types ── */
type PurchaseRecord = {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: number;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
  createdAt: string;
};

type SupplierSummary = {
  supplierId: string;
  supplierName: string;
  latestPrice: number;
  avgPrice: number;
  purchaseCount: number;
  lastPurchaseDate: string;
};

type ProductGroup = {
  productName: string;
  suppliers: SupplierSummary[];
  cheapest: string;
  mostExpensive: string;
  potentialSavings: number;
};

/* ── Props ── */
interface Props {
  productName?: string;
}

export default function SupplierPriceComparator({ productName = "" }: Props) {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(productName);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/purchases?limit=100", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const rows: PurchaseRecord[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.purchases)
          ? data.purchases
          : [];
        setPurchases(rows);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const groups = useMemo<ProductGroup[]>(() => {
    const byProduct: Record<string, Record<string, PurchaseRecord[]>> = {};

    for (const p of purchases) {
      const key = p.productName.toLowerCase();
      if (!byProduct[key]) byProduct[key] = {};
      if (!byProduct[key][p.supplierId]) byProduct[key][p.supplierId] = [];
      byProduct[key][p.supplierId].push(p);
    }

    return Object.entries(byProduct)
      .filter(([key]) => !search || key.includes(search.toLowerCase()))
      .map(([, supplierMap]) => {
        const firstProduct = Object.values(supplierMap)[0][0];
        const suppliers: SupplierSummary[] = Object.entries(supplierMap).map(
          ([sid, recs]) => {
            const sorted = [...recs].sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
            const avg =
              recs.reduce((s, r) => s + r.unitCost, 0) / recs.length;
            return {
              supplierId: sid,
              supplierName: sorted[0].supplierName,
              latestPrice: sorted[0].unitCost,
              avgPrice: avg,
              purchaseCount: recs.length,
              lastPurchaseDate: sorted[0].createdAt.split("T")[0],
            };
          }
        );

        suppliers.sort((a, b) => a.latestPrice - b.latestPrice);
        const cheapest = suppliers[0].supplierId;
        const mostExpensive = suppliers[suppliers.length - 1].supplierId;
        const maxPrice = suppliers[suppliers.length - 1].latestPrice;
        const minPrice = suppliers[0].latestPrice;
        const potentialSavings =
          suppliers.length > 1 ? (maxPrice - minPrice) * 4 : 0; // estimado mensual

        return {
          productName: firstProduct.productName,
          suppliers,
          cheapest,
          mostExpensive,
          potentialSavings,
        };
      })
      .sort((a, b) => b.potentialSavings - a.potentialSavings);
  }, [purchases, search]);

  const totalSavings = useMemo(
    () => groups.reduce((s, g) => s + g.potentialSavings, 0),
    [groups]
  );

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Comparador de Precios por Proveedor
          </SectionTitle>
        </div>
        {totalSavings > 0 && (
          <div className="flex items-center gap-1.5 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)] px-3 py-1.5 rounded-lg text-sm font-medium">
            <TrendingDown className="w-4 h-4" />
            Ahorro potencial mensual: {fmt(totalSavings)}
          </div>
        )}
      </div>

      {/* Buscador */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filtrar por nombre de producto..."
        className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {/* Estados */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando historial de compras...
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 text-[var(--data-error)] dark:text-[var(--data-error)] px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {!loading && !error && groups.length === 0 && (
        <div className="text-center py-12 text-[var(--text-tertiary)] text-sm">
          No hay datos de compras registrados.
        </div>
      )}

      {/* Grupos de productos */}
      {!loading &&
        !error &&
        groups.map((group) => (
          <div
            key={group.productName}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-750">
              <span className="font-medium text-[var(--text-primary)] text-sm">
                {group.productName}
              </span>
              {group.potentialSavings > 0 && (
                <span className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)] font-medium">
                  Ahorro posible: {fmt(group.potentialSavings)}/mes
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-base)]">
                    <th className="px-4 py-2.5 text-left font-medium text-[var(--text-tertiary)]">
                      Proveedor
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium text-[var(--text-tertiary)]">
                      Ultimo precio
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium text-[var(--text-tertiary)]">
                      Precio promedio
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium text-[var(--text-tertiary)]">
                      Compras
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium text-[var(--text-tertiary)]">
                      Ultima fecha
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium text-[var(--text-tertiary)]">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {group.suppliers.map((s) => {
                    const isCheapest = s.supplierId === group.cheapest;
                    const isExpensive = s.supplierId === group.mostExpensive && group.suppliers.length > 1;
                    return (
                      <tr
                        key={s.supplierId}
                        className={cn(
                          "transition-colors",
                          isCheapest
                            ? "bg-[var(--accent-soft)]/50 dark:bg-[var(--accent-muted)]"
                            : isExpensive
                            ? "bg-[var(--data-error-50)]/30 dark:bg-[var(--data-error)]/5"
                            : "hover:bg-gray-50 dark:hover:bg-gray-750"
                        )}
                      >
                        <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium">
                          {s.supplierName}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-right font-semibold",
                            isCheapest
                              ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                              : isExpensive
                              ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
                              : "text-[var(--text-primary)]"
                          )}
                        >
                          {fmt(s.latestPrice)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                          {fmt(s.avgPrice)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">
                          {s.purchaseCount}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-tertiary)] text-xs">
                          {s.lastPurchaseDate}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {isCheapest ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--data-success)] dark:text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              Mas barato
                            </span>
                          ) : isExpensive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--data-error)] dark:text-[var(--data-error)] bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/30 px-2 py-0.5 rounded-full">
                              Mas caro
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-tertiary)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Recomendacion */}
            {group.suppliers.length > 1 && (
              <div className="px-4 py-2.5 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-t border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-xs text-[var(--data-success)] dark:text-[var(--data-success)]">
                Si compras todo a{" "}
                <span className="font-semibold">
                  {group.suppliers.find((s) => s.supplierId === group.cheapest)?.supplierName}
                </span>
                , ahorras aproximadamente{" "}
                <span className="font-semibold">{fmt(group.potentialSavings)}</span> al mes.
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
