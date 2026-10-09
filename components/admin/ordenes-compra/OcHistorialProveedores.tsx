"use client";

import { CardTitle } from "@buleje/design-system";
import { ChevronDown, ChevronUp, History, TrendingUp, BarChart3 } from "@buleje/design-system/icons";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import dynamic from "next/dynamic";

const SupplierScorecard = dynamic(() => import("@/components/admin/compras/SupplierScorecard"), { ssr: false });
const SupplierTimeline = dynamic(() => import("@/components/admin/compras/SupplierTimeline"), { ssr: false });

/** Historial por proveedor. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcHistorialProveedores({ oc }: { oc: OrdenesCompra }) {
  const {
    orders, suppliers, showSupplierHistory, expandedHistorySupplier, setExpandedHistorySupplier,
    getSupplierStats,
  } = oc;
  return (
    <>
      {/* Supplier History Cards */}
      {showSupplierHistory && (
        <div className="space-y-3">
          {suppliers.filter(s => orders.some(o => o.supplierId === s.id)).map(supplier => {
            const stats = getSupplierStats(supplier.id);
            const isExpanded = expandedHistorySupplier === supplier.id;
            const maxMonthAmount = Math.max(...stats.monthlyData.map(m => m.amount), 1);

            return (
              <div key={supplier.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                        <History className="h-5 w-5 text-primary" />
                        {supplier.name}
                      </CardTitle>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">
                        {supplier.ruc && `RUC: ${supplier.ruc}`}
                      </p>
                    </div>
                    <button
                      onClick={() => setExpandedHistorySupplier(isExpanded ? null : supplier.id)}
                      className="text-xs font-bold text-primary hover:text-primary-dark flex items-center gap-1"
                    >
                      {isExpanded ? "Ocultar" : "Ver historial completo"}
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div className="bg-primary/10 dark:bg-primary/15 rounded-xl p-3 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                      <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] uppercase mb-1">Órdenes</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{stats.count}</p>
                    </div>
                    <div className="bg-primary/10 dark:bg-primary/15 rounded-xl p-3 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                      <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] uppercase mb-1">Total gastado</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatCurrency(Number(stats.totalAmount))}</p>
                    </div>
                    <div className="bg-[var(--surface-sunken)] rounded-xl p-3 border border-[var(--rule-base)]">
                      <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase mb-1">Promedio</p>
                      <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{formatCurrency(Number(stats.avgAmount))}</p>
                    </div>
                    <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 rounded-xl p-3 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30">
                      <p className="text-xs font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-ink)] uppercase mb-1">Última compra</p>
                      <p className="text-xs font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{stats.lastPurchase ? formatDate(stats.lastPurchase) : "—"}</p>
                    </div>
                  </div>

                  {/* Top Products */}
                  {stats.topProducts.length > 0 && (
                    <div className="bg-[var(--surface-alt)] rounded-xl p-3 mb-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                      <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase mb-2 flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Top 3 productos más comprados
                      </p>
                      <div className="space-y-1.5">
                        {stats.topProducts.map((prod, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted">#{idx + 1}</span>
                              {prod.name}
                              <span className="text-[var(--text-tertiary)] dark:text-muted text-xs">({prod.count} und)</span>
                            </span>
                            <span className="font-semibold text-primary">{formatCurrency(Number(prod.total))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Monthly Chart */}
                  <div className="bg-[var(--surface-sunken)] rounded-xl p-3 border border-[var(--rule-base)]">
                    <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] uppercase mb-2 flex items-center gap-1">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                      Gastos mensuales (últimos 6 meses)
                    </p>
                    <div className="flex flex-wrap items-end gap-2 h-20">
                      {stats.monthlyData.map((m, idx) => {
                        const height = maxMonthAmount > 0 ? (m.amount / maxMonthAmount) * 100 : 0;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full flex items-end justify-center" style={{ height: "64px" }}>
                              <div
                                className="w-full bg-[var(--text-primary)] rounded-t transition-all hover:opacity-80"
                                style={{ height: `${height}%` }}
                                title={`${m.month}: ${formatCurrency(Number(m.amount))}`}
                              ></div>
                            </div>
                            <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">{m.month}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Expandido: cómo se porta el proveedor y su cronología.
                    SupplierScorecard y SupplierTimeline ya existían en
                    components/admin/compras/ y ningún archivo los importaba;
                    la cronología estaba reimplementada a mano acá, sin las
                    devoluciones que el Timeline sí cruza. */}
                {isExpanded && (
                  <div className="border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] p-4 space-y-4">
                    <SupplierScorecard supplierId={supplier.id} />
                    <SupplierTimeline supplierId={supplier.id} supplierName={supplier.name} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
