"use client";

import { X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderFilters, FiltersAction } from "./types";
import { STATUS_LABELS } from "./types";
import type { OrderStatus } from "@/lib/jsondb";

interface OrdersFiltersProps {
  filters: OrderFilters;
  dispatch: React.Dispatch<FiltersAction>;
  onClose: () => void;
}

export function OrdersFilters({ filters, dispatch, onClose }: OrdersFiltersProps) {
  const handleClearAndClose = () => {
    dispatch({ type: "CLEAR" });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-card rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border shrink-0">
          <div>
            <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Filtros Avanzados</h3>
            <p className="text-xs text-gray-400 dark:text-muted mt-0.5">Afina tu búsqueda de pedidos</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Status multi-select */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700 dark:text-foreground">Estado</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(status => (
                <label
                  key={status}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                    filters.statuses.has(status)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={filters.statuses.has(status)}
                    onChange={(e) => {
                      const next = new Set(filters.statuses);
                      if (e.target.checked) next.add(status);
                      else next.delete(status);
                      dispatch({ type: "SET_STATUSES", statuses: next });
                    }}
                    className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-semibold">{STATUS_LABELS[status]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700 dark:text-foreground">Método de Pago</p>
            <div className="flex gap-2">
              {(["yape", "efectivo"] as const).map(method => (
                <button
                  key={method}
                  onClick={() => dispatch({
                    type: "SET_PAYMENT_METHOD",
                    value: filters.paymentMethod === method ? "" : method,
                  })}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors",
                    filters.paymentMethod === method
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface"
                  )}
                >
                  {method === "yape" ? "Yape" : "Efectivo"}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700 dark:text-foreground">Fecha desde</p>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => dispatch({ type: "SET_DATE_FROM", value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700 dark:text-foreground">Fecha hasta</p>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => dispatch({ type: "SET_DATE_TO", value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Amount range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700 dark:text-foreground">Monto mínimo</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                <input
                  type="number"
                  value={filters.amountMin}
                  onChange={(e) => dispatch({ type: "SET_AMOUNT_MIN", value: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700 dark:text-foreground">Monto máximo</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">S/</span>
                <input
                  type="number"
                  value={filters.amountMax}
                  onChange={(e) => dispatch({ type: "SET_AMOUNT_MAX", value: e.target.value })}
                  placeholder="999.99"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Customer search */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-gray-700 dark:text-foreground">Buscar Cliente</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={filters.customerSearch}
                onChange={(e) => dispatch({ type: "SET_CUSTOMER_SEARCH", value: e.target.value })}
                placeholder="Nombre o teléfono..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasDebt}
                onChange={(e) => dispatch({ type: "SET_HAS_DEBT", value: e.target.checked })}
                className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
              />
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Tiene deuda pendiente</p>
                <p className="text-xs text-gray-500 dark:text-muted">Solo pedidos con deuda sin cobrar</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface cursor-pointer">
              <input
                type="checkbox"
                checked={filters.hasAdminNotes}
                onChange={(e) => dispatch({ type: "SET_HAS_ADMIN_NOTES", value: e.target.checked })}
                className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
              />
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Tiene notas internas</p>
                <p className="text-xs text-gray-500 dark:text-muted">Solo pedidos con comentarios del equipo</p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-card-border shrink-0 flex gap-3">
          <button
            onClick={handleClearAndClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-600 dark:text-muted border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          >
            Limpiar filtros
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </div>
  );
}
