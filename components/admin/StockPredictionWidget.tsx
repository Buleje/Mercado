"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Clock, Package, RefreshCw, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Product, Sale } from "@/types/erp";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockItem {
  id: number | string;
  name: string;
  stock: number;
  daysLeft: number;
  dailyRate: number;
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

// ── Local calculation ──────────────────────────────────────────────────────────

function calcStockPredictions(
  products: Product[],
  sales: Sale[]
): StockItem[] {
  // Count units sold per product in last 30 days
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const sold: Record<string | number, number> = {};

  for (const sale of sales) {
    if (!sale.createdAt || sale.createdAt.slice(0, 10) < cutoff) continue;
    for (const item of sale.items ?? []) {
      const pid = item.productId ?? item.name;
      if (pid != null) {
        sold[pid] = (sold[pid] ?? 0) + (item.quantity ?? 1);
      }
    }
  }

  const results: StockItem[] = [];

  for (const p of products) {
    if (!p.active) continue;
    const stock = p.stock ?? 0;
    if (stock <= 0) continue;

    const unitsSold = sold[p.id] ?? sold[p.name] ?? 0;
    const dailyRate = unitsSold / 30;

    if (dailyRate <= 0) continue;

    const daysLeft = Math.floor(stock / dailyRate);
    results.push({
      id: p.id,
      name: p.name,
      stock,
      daysLeft,
      dailyRate: Math.round(dailyRate * 10) / 10,
    });
  }

  return results
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 10);
}

// ── Urgency helpers ────────────────────────────────────────────────────────────

function urgencyClass(days: number) {
  if (days < 3)
    return "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400";
  if (days < 7)
    return "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400";
  return "bg-muted dark:bg-muted/40 border-border text-foreground dark:text-foreground";
}

function urgencyIcon(days: number) {
  if (days < 3) return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--data-error)] dark:text-[var(--data-error)]" />;
  if (days < 7) return <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning)] dark:text-[var(--data-warning)]" />;
  return <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockPredictionWidget() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // Try dedicated endpoint first, fall back to calculating locally
      const res = await fetch("/api/inventory/stock-prediction");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setItems(data.slice(0, 10));
          setLastUpdated(new Date());
          setLoading(false);
          return;
        }
      }
    } catch {
      // endpoint not available — compute locally
    }

    try {
      const [productsRes, salesRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/sales?limit=500"),
      ]);

      if (!productsRes.ok || !salesRes.ok) throw new Error("Error al cargar datos");

      const products: Product[] = await productsRes.json();
      const sales: Sale[] = await salesRes.json();

      const computed = calcStockPredictions(products, sales);
      setItems(computed);
      setLastUpdated(new Date());
    } catch {
      setError("No se pudo calcular la prediccion de stock.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const criticalCount = items.filter((i) => i.daysLeft < 3).length;
  const warningCount = items.filter((i) => i.daysLeft >= 3 && i.daysLeft < 7).length;

  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground dark:text-foreground">
            Prediccion de agotamiento de stock
          </span>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted dark:hover:bg-muted/50 transition-colors disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Summary badges */}
      {!loading && (criticalCount > 0 || warningCount > 0) && (
        <div className="flex gap-2 flex-wrap">
          {criticalCount > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--data-error-100)] dark:bg-red-950/30 text-[var(--data-error)] dark:text-[var(--data-error)] border border-[var(--data-error)] dark:border-[var(--data-error)]">
              {criticalCount} critico{criticalCount > 1 ? "s" : ""}
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] dark:bg-yellow-950/30 text-[var(--data-warning)] dark:text-[var(--data-warning)] border border-[var(--data-warning)] dark:border-[var(--data-warning)]">
              {warningCount} en riesgo
            </span>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Calculando predicciones...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex items-start gap-2 rounded-md bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)] px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-[var(--data-error)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay datos de ventas suficientes para predecir.
        </p>
      )}

      {/* Item list */}
      {!loading && !error && items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item, idx) => (
            <li
              key={item.id ?? idx}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
                urgencyClass(item.daysLeft)
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {urgencyIcon(item.daysLeft)}
                <span className="font-medium truncate">{item.name}</span>
              </div>
              <span className="text-xs font-semibold shrink-0 tabular-nums">
                {item.daysLeft === 1
                  ? "se acaba hoy"
                  : `se acaba en ${item.daysLeft} dias`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-xs text-muted-foreground text-right">
          Actualizado: {lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
          {" "}· se refresca cada 5 min
        </p>
      )}
    </div>
  );
}
