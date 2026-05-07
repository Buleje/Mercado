"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Package,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Tag,
  Truck,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  category: string;
  stock: number;
  price: number;
  unit: string;
  lastSaleDate?: string | null;
  updatedAt?: string;
}

interface StaleProduct extends Product {
  daysSinceLastSale: number;
  suggestion: "ofertar" | "devolver" | "revisar";
}

const STALE_THRESHOLDS = {
  revisar: 15,
  ofertar: 30,
  devolver: 60,
};

const SUGGESTION_CONFIG: Record<
  StaleProduct["suggestion"],
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  revisar: {
    label: "Revisar",
    color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20",
    icon: AlertTriangle,
  },
  ofertar: {
    label: "Considere ofertar",
    color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20",
    icon: Tag,
  },
  devolver: {
    label: "Considere devolver al proveedor",
    color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
    bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20",
    icon: Truck,
  },
};

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getSuggestion(days: number): StaleProduct["suggestion"] {
  if (days >= STALE_THRESHOLDS.devolver) return "devolver";
  if (days >= STALE_THRESHOLDS.ofertar) return "ofertar";
  return "revisar";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StaleProductAlert() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [sortBy, setSortBy] = useState<"days" | "stock" | "value">("days");

  const loadProducts = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/products?limit=200");
      if (!res.ok) throw new Error("Error al cargar productos");
      const data: Product[] = await res.json();
      setProducts(data);
    } catch {
      setError("No se pudo cargar el listado de productos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const staleProducts = useMemo((): StaleProduct[] => {
    return products
      .map((p) => {
        const days = daysSince(p.lastSaleDate ?? p.updatedAt);
        return { ...p, daysSinceLastSale: days, suggestion: getSuggestion(days) };
      })
      .filter((p) => p.daysSinceLastSale >= STALE_THRESHOLDS.revisar)
      .sort((a, b) => {
        if (sortBy === "days") return b.daysSinceLastSale - a.daysSinceLastSale;
        if (sortBy === "stock") return b.stock - a.stock;
        return b.stock * b.price - a.stock * a.price;
      });
  }, [products, sortBy]);

  const counts = useMemo(() => {
    return {
      revisar: staleProducts.filter((p) => p.suggestion === "revisar").length,
      ofertar: staleProducts.filter((p) => p.suggestion === "ofertar").length,
      devolver: staleProducts.filter((p) => p.suggestion === "devolver").length,
    };
  }, [staleProducts]);

  const totalValueStale = useMemo(
    () => staleProducts.reduce((s, p) => s + p.stock * p.price, 0),
    [staleProducts]
  );

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
      {/* Header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v); }}
        className="flex w-full items-center justify-between px-5 py-4 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <TrendingDown className="h-5 w-5 text-[var(--data-warning-500)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            Productos sin movimiento
          </span>
          {staleProducts.length > 0 && (
            <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-xs font-bold text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]">
              {staleProducts.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              loadProducts();
            }}
            disabled={loading}
            className="rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)]"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--rule-base)]">
          {/* Summary cards */}
          {!loading && staleProducts.length > 0 && (
            <div className="grid grid-cols-3 gap-px border-b border-[var(--rule-soft)] bg-gray-100 dark:border-[var(--rule-base)] dark:bg-gray-700">
              {(["revisar", "ofertar", "devolver"] as const).map((key) => {
                const cfg = SUGGESTION_CONFIG[key];
                return (
                  <div
                    key={key}
                    className="flex flex-col items-center py-3 bg-[var(--surface-raised)]"
                  >
                    <span className={cn("text-xl font-bold", cfg.color)}>{counts[key]}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading / error / empty */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
              <span className="ml-2 text-sm text-[var(--text-tertiary)]">Cargando...</span>
            </div>
          )}
          {!loading && error && (
            <div className="p-4 text-center text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</div>
          )}
          {!loading && !error && staleProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="mb-2 h-8 w-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">
                Todos los productos tienen movimiento reciente.
              </p>
            </div>
          )}

          {!loading && staleProducts.length > 0 && (
            <>
              {/* Sort controls */}
              <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-5 py-2 dark:border-[var(--rule-base)]">
                <span className="text-xs text-[var(--text-tertiary)]">Ordenar por:</span>
                {(["days", "stock", "value"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs transition",
                      sortBy === s
                        ? "bg-primary text-white"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                    )}
                  >
                    {s === "days" ? "Días sin venta" : s === "stock" ? "Stock" : "Valor"}
                  </button>
                ))}
                <span className="ml-auto text-xs text-[var(--text-tertiary)]">
                  Valor total: <strong className="text-[var(--data-error-500)]">{fmt(totalValueStale)}</strong>
                </span>
              </div>

              {/* Product list */}
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {staleProducts.map((p) => {
                  const cfg = SUGGESTION_CONFIG[p.suggestion];
                  const SuggIcon = cfg.icon;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          cfg.bg
                        )}
                      >
                        <SuggIcon className={cn("h-4 w-4", cfg.color)} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {p.name}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {p.category} · Stock: {p.stock} {p.unit} · {fmt(p.stock * p.price)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p
                          className={cn(
                            "text-sm font-bold",
                            p.daysSinceLastSale >= 60
                              ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                              : p.daysSinceLastSale >= 30
                              ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                              : "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                          )}
                        >
                          {p.daysSinceLastSale >= 999 ? "Sin ventas" : `${p.daysSinceLastSale}d`}
                        </p>
                        <p className={cn("text-xs font-medium", cfg.color)}>{cfg.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
