 
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Brain,
  RefreshCw,
  Download,
  TrendingDown,
  AlertTriangle,
  Package,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string | number;
  name: string;
  stock: number;
  stockMin: number;
  price: number;
  cost?: number;
  category: string;
  unit?: string;
}

interface Purchase {
  productId: string | number;
  supplierId?: string;
  supplierName?: string;
  unitCost: number;
  quantity: number;
  date: string;
}

interface SaleData {
  productId: string | number;
  quantity: number;
}

interface AdvisedItem {
  product: Product;
  daysUntilOut: number;
  weeklySales: number;
  suggestedQty: number;
  bestSupplier: string | null;
  bestCost: number | null;
  estimatedTotal: number;
  urgency: "critical" | "high" | "medium";
  season: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEASON_TIPS: Record<string, string> = {
  "Bebidas": "Verano aumenta demanda x2 en bebidas frias.",
  "Snacks": "Fiestas patrias y navidad disparan snacks.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getUrgencyLabel(u: AdvisedItem["urgency"]): string {
  return { critical: "Critico", high: "Urgente", medium: "Esta semana" }[u];
}

const URGENCY_COLORS: Record<AdvisedItem["urgency"], string> = {
  critical: "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400",
  high: "text-[#f4a261] bg-[#f4a261]/10",
  medium: "text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400",
};

// ── Mock data ─────────────────────────────────────────────────────────────────

function getMockProducts(): Product[] {
  return [
    { id: "1", name: "Arroz Costeño 5kg", stock: 3, stockMin: 10, price: 19, cost: 14, category: "Abarrotes", unit: "bolsa" },
    { id: "2", name: "Aceite Primor 1L", stock: 1, stockMin: 6, price: 8.5, cost: 6.2, category: "Abarrotes", unit: "unidad" },
    { id: "3", name: "Gaseosa Inca Kola 2L", stock: 4, stockMin: 12, price: 6.5, cost: 4.8, category: "Bebidas", unit: "botella" },
    { id: "4", name: "Azucar Rubia 1kg", stock: 8, stockMin: 15, price: 4.5, cost: 3.3, category: "Abarrotes", unit: "bolsa" },
    { id: "5", name: "Fideos Don Vittorio 500g", stock: 6, stockMin: 10, price: 3.2, cost: 2.4, category: "Abarrotes", unit: "paquete" },
  ];
}

function getMockSales(): SaleData[] {
  return [
    { productId: "1", quantity: 14 },
    { productId: "2", quantity: 9 },
    { productId: "3", quantity: 22 },
    { productId: "4", quantity: 18 },
    { productId: "5", quantity: 11 },
  ];
}

function getMockPurchases(): Purchase[] {
  return [
    { productId: "1", supplierName: "Distribuidora Norte", unitCost: 14, quantity: 20, date: "2025-01-10" },
    { productId: "1", supplierName: "Mayorista Central", unitCost: 13.5, quantity: 30, date: "2025-01-05" },
    { productId: "2", supplierName: "Distribuidora Norte", unitCost: 6.2, quantity: 12, date: "2025-01-08" },
    { productId: "3", supplierName: "Coca Cola Distr.", unitCost: 4.8, quantity: 24, date: "2025-01-12" },
    { productId: "4", supplierName: "Mayorista Central", unitCost: 3.3, quantity: 50, date: "2025-01-07" },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SmartPurchaseAdvisor() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleData[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, salesRes, purchRes] = await Promise.all([
        fetch("/api/products?active=true&limit=200", { cache: "no-store" }),
        fetch("/api/sales?days=7&groupBy=product", { cache: "no-store" }),
        fetch("/api/purchases?limit=200", { cache: "no-store" }),
      ]);

      let anyFailed = false;

      if (prodRes.ok) {
        const j = await prodRes.json();
        setProducts(j.products ?? j ?? []);
      } else anyFailed = true;

      if (salesRes.ok) {
        const j = await salesRes.json();
        setSales(j.items ?? j ?? []);
      } else anyFailed = true;

      if (purchRes.ok) {
        const j = await purchRes.json();
        setPurchases(j.purchases ?? j ?? []);
      } else anyFailed = true;

      if (anyFailed) throw new Error("partial");
    } catch {
      setProducts(getMockProducts());
      setSales(getMockSales());
      setPurchases(getMockPurchases());
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Best supplier per product from purchase history
  const bestSupplierMap = useMemo(() => {
    const map: Record<string, { name: string; cost: number }> = {};
    purchases.forEach((p) => {
      const key = String(p.productId);
      if (!map[key] || p.unitCost < map[key].cost) {
        map[key] = { name: p.supplierName ?? "Proveedor desconocido", cost: p.unitCost };
      }
    });
    return map;
  }, [purchases]);

  const salesMap = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach((s) => {
      map[String(s.productId)] = s.quantity;
    });
    return map;
  }, [sales]);

  const advised = useMemo<AdvisedItem[]>(() => {
    return products
      .map((p) => {
        const weeklySales = salesMap[String(p.id)] ?? 0;
        const dailySales = weeklySales / 7;
        const daysUntilOut = dailySales > 0 ? Math.floor(p.stock / dailySales) : 99;
        const reorderTarget = Math.max(p.stockMin ?? 0, dailySales * 14);
        const suggestedQty = Math.max(0, Math.ceil(reorderTarget - p.stock));
        const bestSup = bestSupplierMap[String(p.id)] ?? null;
        const estimatedTotal = suggestedQty * (bestSup?.cost ?? p.cost ?? p.price * 0.7);
        const urgency: AdvisedItem["urgency"] =
          daysUntilOut <= 2 ? "critical" : daysUntilOut <= 5 ? "high" : "medium";
        const season = SEASON_TIPS[p.category] ?? null;

        return {
          product: p,
          daysUntilOut,
          weeklySales,
          suggestedQty,
          bestSupplier: bestSup?.name ?? null,
          bestCost: bestSup?.cost ?? null,
          estimatedTotal,
          urgency,
          season,
        };
      })
      .filter((i) => i.suggestedQty > 0)
      .sort((a, b) => {
        const o = { critical: 0, high: 1, medium: 2 };
        return o[a.urgency] - o[b.urgency];
      });
  }, [products, salesMap, bestSupplierMap]);

  const totalEstimated = useMemo(
    () => advised.reduce((s, i) => s + i.estimatedTotal, 0),
    [advised]
  );

  const exportCSV = useCallback(() => {
    const header = "Producto,Stock actual,Ventas 7d,Dias restantes,Cantidad sugerida,Mejor proveedor,Costo unitario,Total estimado,Urgencia";
    const rows = advised.map(
      (i) =>
        `"${i.product.name}",${i.product.stock},${i.weeklySales},${i.daysUntilOut === 99 ? "sin ventas" : i.daysUntilOut},"${i.suggestedQty} ${i.product.unit ?? "u"}","${i.bestSupplier ?? "-"}","${i.bestCost ? fmt(i.bestCost) : "-"}","${fmt(i.estimatedTotal)}","${getUrgencyLabel(i.urgency)}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lista_compras_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [advised]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#2d6a4f]/10">
              <Brain className="w-5 h-5 text-[#2d6a4f]" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">
                Advisor de compras
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Combina stock, velocidad de venta y historial de precios
                {usingMock && (
                  <span className="ml-2 text-[#f4a261]">(datos demo)</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {advised.length > 0 && (
              <button
                onClick={exportCSV}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Exportar CSV"
              >
                <Download className="w-5 h-5 text-gray-500" />
              </button>
            )}
            <button
              onClick={fetchAll}
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
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900">
              <p className="text-xl font-black text-red-600 dark:text-red-400">
                {advised.filter((i) => i.urgency === "critical").length}
              </p>
              <p className="text-xs text-red-500 font-semibold">Criticos</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-[#f4a261]/5 border border-[#f4a261]/20">
              <p className="text-xl font-black text-[#f4a261]">
                {advised.filter((i) => i.urgency === "high").length}
              </p>
              <p className="text-xs text-[#f4a261] font-semibold">Urgentes</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-[#2d6a4f]/5 border border-[#2d6a4f]/20">
              <p className="text-xl font-black text-[#2d6a4f] dark:text-[#52b788]">
                {fmt(totalEstimated)}
              </p>
              <p className="text-xs text-[#2d6a4f] dark:text-[#52b788] font-semibold">
                Costo estimado
              </p>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-5 flex gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
              </div>
              <div className="w-24 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl" />
            </div>
          ))
        ) : advised.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-10 h-10 text-[#2d6a4f] mx-auto mb-3" />
            <p className="font-semibold text-gray-900 dark:text-white">
              Stock en buen estado
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              No se requieren compras urgentes en este momento.
            </p>
          </div>
        ) : (
          advised.map((item) => {
            const isExpanded = expandedId === item.product.id;
            return (
              <div key={String(item.product.id)}>
                <button
                  onClick={() =>
                    setExpandedId((p) => (p === item.product.id ? null : item.product.id))
                  }
                  className={cn(
                    "w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-l-4",
                    item.urgency === "critical"
                      ? "border-l-red-500"
                      : item.urgency === "high"
                        ? "border-l-[#f4a261]"
                        : "border-l-blue-400"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">
                        {item.product.name}
                      </p>
                      <span
                        className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          URGENCY_COLORS[item.urgency]
                        )}
                      >
                        {getUrgencyLabel(item.urgency)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Stock: {item.product.stock} {item.product.unit ?? "u"} —
                      Ventas 7d: {item.weeklySales} —
                      {item.daysUntilOut >= 99
                        ? " Sin ventas registradas"
                        : ` ${item.daysUntilOut} dias restantes`}
                    </p>
                    {item.bestSupplier && (
                      <p className="text-xs text-[#2d6a4f] dark:text-[#52b788] mt-0.5 flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        Mejor proveedor: {item.bestSupplier} — {fmt(item.bestCost ?? 0)}/u
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Comprar</p>
                      <p className="font-black text-gray-900 dark:text-white">
                        {item.suggestedQty} {item.product.unit ?? "u"}
                      </p>
                      <p className="text-xs text-[#2d6a4f] dark:text-[#52b788] font-semibold">
                        {fmt(item.estimatedTotal)}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-4 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-gray-400 mb-1">Analisis de stock</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Stock minimo: {item.product.stockMin} {item.product.unit ?? "u"}
                        </p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Venta diaria: {Math.round((item.weeklySales / 7) * 10) / 10} {item.product.unit ?? "u"}
                        </p>
                        {item.daysUntilOut < 99 && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                              Se agota en {item.daysUntilOut} dias
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-gray-400 mb-1">Orden sugerida</p>
                        <p className="text-sm font-bold text-[#2d6a4f] dark:text-[#52b788]">
                          {item.suggestedQty} {item.product.unit ?? "u"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Cubre 14 dias de ventas + stock minimo
                        </p>
                        {item.bestCost && (
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">
                            {fmt(item.bestCost)}/u x {item.suggestedQty} = {fmt(item.estimatedTotal)}
                          </p>
                        )}
                      </div>
                    </div>
                    {item.season && (
                      <div className="mt-3 p-3 rounded-xl bg-[#f4a261]/10 border border-[#f4a261]/20">
                        <p className="text-xs font-semibold text-[#f4a261] flex items-center gap-1.5">
                          <TrendingDown className="w-3 h-3" />
                          Tip de temporada
                        </p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
                          {item.season}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
