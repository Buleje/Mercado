"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { TrendingDown, AlertTriangle, RefreshCw, Package, ShoppingCart } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type PredictionItem = {
  productId: number;
  productName: string;
  category: string;
  stock: number;
  unit: string;
  avgDailySales: number;
  daysRemaining: number | null;
};

function urgencyColor(days: number | null): string {
  if (days === null) return "text-[var(--text-tertiary)] dark:text-muted";
  if (days < 3) return "text-red-600 dark:text-red-400";
  if (days < 7) return "text-orange-600 dark:text-orange-400";
  if (days < 14) return "text-amber-600 dark:text-amber-400";
  return "text-[var(--data-success)] dark:text-[var(--data-success)]";
}

function urgencyBg(days: number | null): string {
  if (days === null) return "";
  if (days < 3) return "bg-red-50/50 dark:bg-red-950/10";
  if (days < 7) return "bg-orange-50/50 dark:bg-orange-950/10";
  if (days < 14) return "bg-amber-50/30 dark:bg-amber-950/10";
  return "";
}

function urgencyLabel(days: number | null): string {
  if (days === null) return "Sin ventas recientes";
  if (days < 3) return "Comprar ya";
  if (days < 7) return "Comprar pronto";
  if (days < 14) return "Planificar compra";
  return "OK";
}

export default function StockPrediction() {
  const [items, setItems] = useState<PredictionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetch("/api/inventory/stock-prediction")
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar prediccion");
        return r.json();
      })
      .then((data: PredictionItem[]) => setItems(data))
      .catch(() => setError("No se pudo cargar la prediccion de stock"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const criticalCount = items.filter((i) => i.daysRemaining !== null && i.daysRemaining < 3).length;
  const warningCount = items.filter((i) => i.daysRemaining !== null && i.daysRemaining >= 3 && i.daysRemaining < 7).length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Prediccion de stock
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">
            Productos que se agotan pronto segun ventas de los ultimos 30 dias
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Summary counters */}
      {!loading && !error && items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {criticalCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--data-error)]" />
              <span className="text-sm font-bold text-[var(--data-error)] dark:text-[var(--data-error)]">
                {criticalCount} se agotan en menos de 3 dias
              </span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--data-warning-50)] dark:bg-orange-950/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--data-warning)]" />
              <span className="text-sm font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)]">
                {warningCount} se agotan en menos de 7 dias
              </span>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden animate-pulse">
          <div className="h-10 bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--rule-soft)] dark:border-card-border last:border-0">
              <div className="h-4 w-32 bg-gray-200 dark:bg-surface rounded-full" />
              <div className="h-4 w-16 bg-gray-100 dark:bg-surface/60 rounded-full" />
              <div className="h-4 w-20 bg-gray-100 dark:bg-surface/60 rounded-full" />
              <div className="h-4 w-24 bg-gray-100 dark:bg-surface/60 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error)] shrink-0" />
          <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-8 text-center">
          <Package className="h-10 w-10 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">No hay datos suficientes para predecir el stock</p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">Se necesitan ventas registradas en los ultimos 30 dias</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && items.length > 0 && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
                <tr>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Producto</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Categoria</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Existencias</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Venta/dia</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Se acaba en</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Accion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {items.map((item) => (
                  <tr
                    key={item.productId}
                    className={cn(
                      "hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors",
                      urgencyBg(item.daysRemaining)
                    )}
                  >
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-[var(--text-primary)] dark:text-foreground max-w-48 truncate">
                      {item.productName}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">
                      {item.category}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">
                      {item.stock} <span className="text-xs font-normal text-[var(--text-tertiary)]">{item.unit}</span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">
                      {item.avgDailySales.toFixed(1)}
                    </td>
                    <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right text-sm font-extrabold", urgencyColor(item.daysRemaining))}>
                      {item.daysRemaining !== null ? `${Math.round(item.daysRemaining)} dias` : "—"}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full",
                        item.daysRemaining !== null && item.daysRemaining < 3
                          ? "bg-[var(--data-error-100)] dark:bg-red-950/30 text-[var(--data-error)] dark:text-[var(--data-error)]"
                          : item.daysRemaining !== null && item.daysRemaining < 7
                            ? "bg-[var(--data-warning-100)] dark:bg-orange-950/30 text-[var(--data-warning)] dark:text-[var(--data-warning)]"
                            : item.daysRemaining !== null && item.daysRemaining < 14
                              ? "bg-[var(--data-warning-100)] dark:bg-amber-950/30 text-[var(--data-warning)] dark:text-[var(--data-warning)]"
                              : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted"
                      )}>
                        {item.daysRemaining !== null && item.daysRemaining < 7 && <ShoppingCart className="h-3 w-3" />}
                        {urgencyLabel(item.daysRemaining)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-t border-[var(--rule-soft)] dark:border-card-border text-xs text-[var(--text-tertiary)] dark:text-muted">
            Top {items.length} productos con menor tiempo estimado de stock · Basado en ventas de los ultimos 30 dias
          </div>
        </div>
      )}
    </div>
  );
}
