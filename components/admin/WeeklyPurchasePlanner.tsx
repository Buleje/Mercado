 
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ShoppingBag,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string | number;
  name: string;
  stock: number;
  stockMin: number;
  price: number;
  category: string;
  unit?: string;
}

interface SaleItem {
  productId: string | number;
  quantity: number;
}

interface PlanItem {
  product: Product;
  currentStock: number;
  dailySales: number;
  daysLeft: number;
  suggestedQty: number;
  estimatedCost: number;
  urgency: "critical" | "high" | "medium" | "low";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getUrgency(daysLeft: number): PlanItem["urgency"] {
  if (daysLeft <= 1) return "critical";
  if (daysLeft <= 3) return "high";
  if (daysLeft <= 7) return "medium";
  return "low";
}

const URGENCY_STYLES: Record<PlanItem["urgency"], { badge: string; row: string; label: string }> = {
  critical: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    row: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10",
    label: "Critico",
  },
  high: {
    badge: "bg-[#f97316]/10 text-[#f97316]",
    row: "border-[#f97316]/20 bg-[#f97316]/5 dark:bg-[#f97316]/5",
    label: "Urgente",
  },
  medium: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    row: "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
    label: "Esta semana",
  },
  low: {
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    row: "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30",
    label: "Monitorear",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeeklyPurchasePlanner() {
  const [products, setProducts] = useState<Product[]>([]);
  const [salesMap, setSalesMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, salesRes] = await Promise.all([
        fetch("/api/products?limit=200&active=true", { cache: "no-store" }),
        fetch("/api/sales?days=7&groupBy=product", { cache: "no-store" }),
      ]);

      if (prodRes.ok) {
        const pj = await prodRes.json();
        setProducts(pj.products ?? pj ?? []);
      }

      if (salesRes.ok) {
        const sj = await salesRes.json();
        // Expect { items: [{ productId, totalQty }] }
        const map: Record<string, number> = {};
        const items: SaleItem[] = sj.items ?? sj ?? [];
        items.forEach((i) => {
          map[String(i.productId)] = i.quantity;
        });
        setSalesMap(map);
      }
    } catch {
      setError("No se pudo cargar los datos. Mostrando datos de ejemplo.");
      // Mock
      setProducts([
        { id: "1", name: "Arroz Costeño 5kg", stock: 5, stockMin: 10, price: 19, category: "Abarrotes", unit: "bolsa" },
        { id: "2", name: "Aceite Primor 1L", stock: 2, stockMin: 6, price: 8.5, category: "Abarrotes", unit: "unidad" },
        { id: "3", name: "Azucar Rubia 1kg", stock: 8, stockMin: 12, price: 4.5, category: "Abarrotes", unit: "bolsa" },
        { id: "4", name: "Leche Gloria 400g", stock: 12, stockMin: 8, price: 3.8, category: "Lacteos", unit: "lata" },
        { id: "5", name: "Gaseosa 2L", stock: 3, stockMin: 8, price: 6.5, category: "Bebidas", unit: "botella" },
      ]);
      setSalesMap({ "1": 14, "2": 8, "3": 18, "4": 5, "5": 20 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const plan = useMemo<PlanItem[]>(() => {
    return products
      .map((p) => {
        const weeklySales = salesMap[String(p.id)] ?? 0;
        const dailySales = weeklySales / 7;
        const daysLeft = dailySales > 0 ? Math.floor(p.stock / dailySales) : 99;
        const reorderPoint = Math.max(p.stockMin ?? 0, dailySales * 7);
        const suggestedQty = Math.max(0, Math.ceil(reorderPoint - p.stock + dailySales * 14));
        const estimatedCost = suggestedQty * (p.price * 0.7); // Assume 30% margin
        const urgency = getUrgency(daysLeft);
        return {
          product: p,
          currentStock: p.stock,
          dailySales: Math.round(dailySales * 10) / 10,
          daysLeft,
          suggestedQty,
          estimatedCost,
          urgency,
        };
      })
      .filter((i) => i.urgency !== "low" || i.suggestedQty > 0)
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.urgency] - order[b.urgency];
      });
  }, [products, salesMap]);

  const totalCost = useMemo(
    () => plan.reduce((s, i) => s + i.estimatedCost, 0),
    [plan]
  );

  const exportCSV = useCallback(() => {
    const header = "Producto,Stock actual,Venta diaria,Dias restantes,Cantidad a comprar,Costo estimado,Urgencia";
    const rows = plan.map(
      (i) =>
        `"${i.product.name}",${i.currentStock},${i.dailySales},${i.daysLeft},${i.suggestedQty},${i.estimatedCost.toFixed(2)},${URGENCY_STYLES[i.urgency].label}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan_compras_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [plan]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#00B4A6]/10">
              <ShoppingBag className="w-5 h-5 text-[#00B4A6]" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">
                Planner de compras semanal
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Basado en ventas de los ultimos 7 dias
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {plan.length > 0 && (
              <button
                onClick={exportCSV}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Exportar CSV"
              >
                <Download className="w-5 h-5 text-gray-500" />
              </button>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Actualizar"
            >
              <RefreshCw
                className={cn("w-5 h-5 text-gray-500", loading && "animate-spin")}
              />
            </button>
          </div>
        </div>

        {/* Summary */}
        {!loading && (
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                {plan.filter((i) => i.urgency === "critical").length} criticos
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f97316]/10 border border-[#f97316]/20">
              <Clock className="w-3.5 h-3.5 text-[#f97316]" />
              <span className="text-xs font-semibold text-[#f97316]">
                {plan.filter((i) => i.urgency === "high").length} urgentes
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00B4A6]/10 border border-[#00B4A6]/20 ml-auto">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00B4A6]" />
              <span className="text-xs font-semibold text-[#00B4A6] dark:text-[#2dd4bf]">
                Costo estimado: {fmt(totalCost)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 flex gap-4 animate-pulse">
              <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded" />
              <div className="w-20 h-5 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          ))
        ) : plan.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-[#00B4A6] mx-auto mb-3" />
            <p className="font-semibold text-gray-900 dark:text-white">
              Todo en orden
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              No hay productos que necesiten reabastecimiento esta semana
            </p>
          </div>
        ) : (
          plan.map((item) => {
            const styles = URGENCY_STYLES[item.urgency];
            return (
              <div
                key={String(item.product.id)}
                className={cn(
                  "flex items-center justify-between gap-4 px-5 py-3.5 border-l-4",
                  item.urgency === "critical"
                    ? "border-l-red-500"
                    : item.urgency === "high"
                      ? "border-l-[#f97316]"
                      : item.urgency === "medium"
                        ? "border-l-blue-400"
                        : "border-l-gray-200 dark:border-l-gray-700"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Stock: {item.currentStock} {item.product.unit ?? "u"} —
                    Venta: {item.dailySales}/dia —{" "}
                    {item.daysLeft >= 99 ? "sin ventas" : `${item.daysLeft} dias restantes`}
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Comprar</p>
                    <p className="font-bold text-gray-900 dark:text-white text-sm">
                      {item.suggestedQty} {item.product.unit ?? "u"}
                    </p>
                    <p className="text-xs text-[#00B4A6] dark:text-[#2dd4bf]">
                      {fmt(item.estimatedCost)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap",
                      styles.badge
                    )}
                  >
                    {styles.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="px-5 py-3 bg-[#f97316]/10 border-t border-[#f97316]/20">
          <p className="text-xs text-[#f97316]">{error}</p>
        </div>
      )}
    </div>
  );
}
