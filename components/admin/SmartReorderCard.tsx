"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useEffect, useState, useCallback } from "react";
import { ShoppingBag, Loader2, CheckSquare, Square, AlertTriangle } from "@buleje/design-system/icons";
import { cn, formatCurrency } from "@/lib/utils";
import { calculateReorderSuggestions, type ReorderSuggestion } from "@/lib/smart-reorder";
import { csrfHeaders } from "@/lib/csrf-client";

interface Props {
  className?: string;
}

interface DashboardProduct {
  id: number;
  name: string;
  stock?: number;
  stockMin?: number;
  costPrice?: number;
  price?: number;
  active?: boolean;
}

interface DashboardData {
  products: DashboardProduct[];
  sales: { items: { productId: number; quantity: number }[]; createdAt: string }[];
  orders: { status: string; items: { id: number; quantity: number }[]; createdAt: string }[];
}

export default function SmartReorderCard({ className }: Props) {
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) throw new Error("error");
        const data: DashboardData = await res.json();

        const result = calculateReorderSuggestions(
          data.products ?? [],
          data.sales ?? [],
          data.orders ?? [],
        );

        if (!cancelled) {
          setSuggestions(result);
          // Pre-seleccionar críticos y próximos
          const preSelected = new Set(
            result
              .filter((s) => s.urgency === "critico" || s.urgency === "pronto")
              .map((s) => s.productId),
          );
          setSelected(preSelected);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreateOrder = useCallback(async () => {
    const items = suggestions.filter((s) => selected.has(s.productId));
    if (items.length === 0) return;

    setCreating(true);
    try {
      const body = {
        supplierId: "",
        supplierName: "Por asignar",
        items: items.map((s) => ({
          productId: Number(s.productId),
          name: s.productName,
          quantity: s.suggestedQuantity,
          unitCost: s.estimatedCost / s.suggestedQuantity,
          unit: "und",
        })),
        notes: `Orden generada automáticamente por sugerencia de reorden — ${new Date().toLocaleDateString("es-PE")}`,
      };

      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("error");
      setCreated(true);
      setTimeout(() => setCreated(false), 4000);
    } catch {
      // silencioso — el usuario puede reintentar
    } finally {
      setCreating(false);
    }
  }, [suggestions, selected]);

  const urgencyStyle: Record<ReorderSuggestion["urgency"], string> = {
    critico: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/40 dark:text-[var(--data-error-500)]",
    pronto: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-yellow-950/40 dark:text-[var(--data-warning-500)]",
    planificar: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  };

  const urgencyLabel: Record<ReorderSuggestion["urgency"], string> = {
    critico: "Critico",
    pronto: "Pronto",
    planificar: "Planificar",
  };

  const totalSelected = suggestions
    .filter((s) => selected.has(s.productId))
    .reduce((acc, s) => acc + s.estimatedCost, 0);

  const visibleSuggestions = suggestions.slice(0, 10);

  return (
    <div className={cn(
      "bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-5",
      className,
    )}>
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
          Sugerencias de compra inteligente
        </CardTitle>
        {!loading && suggestions.length > 0 && (
          <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted">
            {suggestions.length} producto{suggestions.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <LoadingState />
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center py-6 gap-2 text-center">
          <AlertTriangle className="w-6 h-6 text-[var(--data-warning-500)]" />
          <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">No se pudo calcular las sugerencias.</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && suggestions.length === 0 && (
        <div className="flex flex-col items-center py-8 gap-2 text-center">
          <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-[var(--data-success-500)]" />
          </div>
          <p className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Stock al dia</p>
          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">
            No hay productos que necesiten reposicion pronto.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && visibleSuggestions.length > 0 && (
        <div className="space-y-3">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted px-1">
            <span>Producto</span>
            <span className="text-right">Stock</span>
            <span className="text-right">Dias</span>
            <span className="text-right">Pedir</span>
            <span className="text-right">Costo est.</span>
            <span className="text-center">Estado</span>
          </div>

          {visibleSuggestions.map((s) => {
            const isSelected = selected.has(s.productId);
            return (
              <button
                key={s.productId}
                onClick={() => toggleSelect(s.productId)}
                className={cn(
                  "w-full flex sm:grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-start sm:items-center p-3 rounded-xl border transition-colors text-left",
                  isSelected
                    ? "border-primary/40 bg-primary/5 dark:border-primary/30 dark:bg-primary/10"
                    : "border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-[var(--surface-raised)]",
                )}
              >
                {/* Checkbox + nombre */}
                <div className="flex items-start gap-2 min-w-0">
                  <div className="shrink-0 mt-0.5">
                    {isSelected
                      ? <CheckSquare className="w-4 h-4 text-primary" />
                      : <Square className="w-4 h-4 text-[var(--text-tertiary)] dark:text-muted" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                      {s.productName}
                    </p>
                    {/* Mobile: info en línea */}
                    <div className="sm:hidden flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">
                      <span>Stock: {s.currentStock}</span>
                      <span>Dias: {s.daysUntilEmpty >= 999 ? "—" : s.daysUntilEmpty}</span>
                      <span>Pedir: {s.suggestedQuantity} und</span>
                      <span>{formatCurrency(s.estimatedCost)}</span>
                    </div>
                  </div>
                </div>

                {/* Desktop cells */}
                <span className="hidden sm:block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted text-right">
                  {s.currentStock}
                </span>
                <span className={cn(
                  "hidden sm:block text-xs font-bold text-right",
                  s.daysUntilEmpty < 3 ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" :
                  s.daysUntilEmpty < 7 ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" :
                  "text-[var(--text-secondary)] dark:text-muted",
                )}>
                  {s.daysUntilEmpty >= 999 ? "—" : s.daysUntilEmpty}
                </span>
                <span className="hidden sm:block text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-right">
                  {s.suggestedQuantity} und
                </span>
                <span className="hidden sm:block text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-right">
                  {formatCurrency(s.estimatedCost)}
                </span>
                <div className="hidden sm:flex justify-center">
                  <span className={cn(
                    "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full",
                    urgencyStyle[s.urgency],
                  )}>
                    {urgencyLabel[s.urgency]}
                  </span>
                </div>
              </button>
            );
          })}

          {/* Footer: total + botón */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
            <div>
              {selected.size > 0 && (
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                  <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{selected.size}</span> producto{selected.size > 1 ? "s" : ""} seleccionado{selected.size > 1 ? "s" : ""} —{" "}
                  <span className="font-bold text-primary dark:text-[var(--data-success-500)]">{formatCurrency(totalSelected)}</span>
                </p>
              )}
            </div>
            <button
              onClick={handleCreateOrder}
              disabled={selected.size === 0 || creating || created}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors min-w-[44px] min-h-[44px] justify-center",
                created
                  ? "bg-[var(--accent-soft)] text-white"
                  : selected.size === 0
                    ? "bg-gray-100 dark:bg-surface text-[var(--text-tertiary)] dark:text-muted cursor-not-allowed"
                    : "bg-primary hover:bg-primary-dark text-white",
              )}
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : created ? (
                "Orden creada"
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  Crear orden de compra
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
