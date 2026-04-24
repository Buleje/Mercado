"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart, ChevronDown,
  ChevronUp, Check, Loader2, TrendingDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Urgency = "CRITICO" | "URGENTE" | "PLANIFICAR";

type Sugerencia = {
  productId: number;
  productName: string;
  category: string;
  currentStock: number;
  stockMin: number;
  dailyAvg: number;
  daysOfStock: number;
  suggestedQty: number;
  suggestedSupplier: { id: string; name: string } | null;
  lastPrice: number | null;
  urgency: Urgency;
};

const URGENCY_CONFIG: Record<Urgency, { label: string; bg: string; border: string; dot: string; text: string }> = {
  CRITICO: { label: "Critico (< 3 dias)", bg: "bg-[var(--data-error-50)] dark:bg-red-950/20", border: "border-[var(--data-error)] dark:border-[var(--data-error)]/40", dot: "bg-[var(--data-error)]", text: "text-[var(--data-error)] dark:text-[var(--data-error)]" },
  URGENTE: { label: "Urgente (< 7 dias)", bg: "bg-[var(--data-warning-50)] dark:bg-yellow-950/20", border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]/40", dot: "bg-[var(--data-warning)]", text: "text-[var(--data-warning)] dark:text-[var(--data-warning)]" },
  PLANIFICAR: { label: "Planificar (> 7 dias)", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30", dot: "bg-[var(--accent-soft)]", text: "text-[var(--data-success)] dark:text-[var(--data-success)]" },
};

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function SugerenciasCompraTab() {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<Urgency, boolean>>({
    CRITICO: false,
    URGENTE: false,
    PLANIFICAR: true,
  });
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compras/sugerencias");
      if (res.ok) {
        const data = await res.json();
        setSugerencias(data.sugerencias ?? []);
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleSelect = (productId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const selectAll = (urgency: Urgency) => {
    const items = sugerencias.filter((s) => s.urgency === urgency);
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = items.every((i) => next.has(i.productId));
      if (allSelected) {
        items.forEach((i) => next.delete(i.productId));
      } else {
        items.forEach((i) => next.add(i.productId));
      }
      return next;
    });
  };

  const toggleCollapse = (urgency: Urgency) => {
    setCollapsed((prev) => ({ ...prev, [urgency]: !prev[urgency] }));
  };

  const createOCs = async () => {
    if (selected.size === 0) return;
    setCreating(true);
    setResult(null);

    try {
      const selectedItems = sugerencias.filter((s) => selected.has(s.productId));

      // Group by supplierId
      const groups = new Map<string, Sugerencia[]>();
      for (const item of selectedItems) {
        const key = item.suggestedSupplier?.id ?? "sin-proveedor";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      let createdCount = 0;
      for (const [supplierId, items] of groups) {
        const supplierName =
          supplierId !== "sin-proveedor"
            ? items[0].suggestedSupplier?.name ?? "Proveedor por definir"
            : "Proveedor por definir";

        const res = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierId: supplierId !== "sin-proveedor" ? supplierId : "",
            supplierName,
            items: items.map((i) => ({
              productId: i.productId,
              name: i.productName,
              quantity: i.suggestedQty,
              unitCost: i.lastPrice ?? 0,
              unit: "und",
            })),
            notes: `OC generada automaticamente por sugerencias de compra`,
          }),
        });

        if (res.ok) {
          createdCount++;
          // Auto-create payable
          const po = await res.json();
          await fetch("/api/payables", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              supplierId: supplierId !== "sin-proveedor" ? supplierId : "",
              supplierName,
              purchaseOrderId: po.id,
              description: `Orden de compra ${po.id}`,
              amount: po.total,
              dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
            }),
          }).catch(() => {});
        }
      }

      setResult(`${createdCount} orden${createdCount !== 1 ? "es" : ""} de compra creada${createdCount !== 1 ? "s" : ""}`);
      setSelected(new Set());
      void load();
    } catch {
      setResult("Error al crear ordenes de compra");
    }
    setCreating(false);
  };

  const grouped: Record<Urgency, Sugerencia[]> = {
    CRITICO: sugerencias.filter((s) => s.urgency === "CRITICO"),
    URGENTE: sugerencias.filter((s) => s.urgency === "URGENTE"),
    PLANIFICAR: sugerencias.filter((s) => s.urgency === "PLANIFICAR"),
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (sugerencias.length === 0) {
    return (
      <div className="text-center py-12">
        <Check className="h-12 w-12 text-[var(--data-success)] mx-auto mb-3" />
        <p className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">
          Tu inventario esta bien
        </p>
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">
          No necesitas comprar nada por ahora
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-primary" />
          <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">
            {sugerencias.length} producto{sugerencias.length !== 1 ? "s" : ""} necesita
            {sugerencias.length === 1 ? "" : "n"} reabastecimiento
          </p>
        </div>
      </div>

      {/* Sections */}
      {(["CRITICO", "URGENTE", "PLANIFICAR"] as Urgency[]).map((urgency) => {
        const items = grouped[urgency];
        if (items.length === 0) return null;
        const config = URGENCY_CONFIG[urgency];
        const isCollapsed = collapsed[urgency];

        return (
          <div key={urgency} className={cn("border rounded-xl overflow-hidden", config.border, config.bg)}>
            {/* Section header */}
            <button
              onClick={() => toggleCollapse(urgency)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <div className={cn("h-2.5 w-2.5 rounded-full", config.dot)} />
                <span className={cn("text-sm font-bold", config.text)}>
                  {config.label} ({items.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); selectAll(urgency); }}
                  className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted hover:text-primary px-2 py-0.5 rounded"
                >
                  {items.every((i) => selected.has(i.productId)) ? "Deseleccionar" : "Seleccionar todos"}
                </button>
                {isCollapsed ? <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />}
              </div>
            </button>

            {/* Items */}
            {!isCollapsed && (
              <div className="px-3 pb-3 grid gap-2 sm:grid-cols-2">
                {items.map((s) => (
                  <div
                    key={s.productId}
                    className={cn(
                      "bg-white dark:bg-card border rounded-lg p-3 transition-all cursor-pointer",
                      selected.has(s.productId)
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-[var(--rule-base)] dark:border-card-border hover:border-gray-300",
                    )}
                    onClick={() => toggleSelect(s.productId)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div
                        className={cn(
                          "mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                          selected.has(s.productId)
                            ? "bg-primary border-primary"
                            : "border-[var(--rule-base)] dark:border-gray-600",
                        )}
                      >
                        {selected.has(s.productId) && <Check className="h-3 w-3 text-white" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Name + category */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground truncate">
                            {s.productName}
                          </span>
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted">
                            {s.category}
                          </span>
                        </div>

                        {/* Stock info */}
                        <p className={cn("text-xs mt-1", s.daysOfStock <= 3 ? "text-[var(--data-error)] font-semibold" : s.daysOfStock <= 7 ? "text-[var(--data-warning)]" : "text-[var(--text-secondary)] dark:text-muted")}>
                          Stock: {s.currentStock} | Venta/dia: {s.dailyAvg} | Para{" "}
                          {s.daysOfStock >= 9999 ? "mucho" : s.daysOfStock} dias
                        </p>

                        {/* Suggested qty */}
                        <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground mt-1">
                          Sugerido: {s.suggestedQty} unidades
                        </p>

                        {/* Supplier + price */}
                        <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-secondary)] dark:text-muted">
                          <span>
                            {s.suggestedSupplier
                              ? `Proveedor: ${s.suggestedSupplier.name}`
                              : "Sin proveedor anterior"}
                          </span>
                          {s.lastPrice != null && (
                            <span>Último: S/ {s.lastPrice.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 bg-white dark:bg-card border-t border-[var(--rule-base)] dark:border-card-border -mx-4 px-4 py-3 flex items-center justify-between gap-3 z-10 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)]">
        <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">
          {selected.size} producto{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          {result && (
            <span className={cn("text-xs font-semibold", result.includes("Error") ? "text-[var(--data-error)]" : "text-[var(--data-success)]")}>
              {result}
            </span>
          )}
          <button
            onClick={createOCs}
            disabled={selected.size === 0 || creating}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg transition-colors"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Crear OC con seleccionados
          </button>
        </div>
      </div>
    </div>
  );
}
