"use client";

import { useState } from "react";
import { Download, Loader2, FileSpreadsheet, TrendingUp, Package, Wallet } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderItem = {
  productId: number;
  productName?: string;
  name?: string;
  quantity: number;
  price: number;
};

type Order = {
  id: string;
  createdAt: string;
  customerName?: string;
  total: number;
  paymentMethod?: string;
  status?: string;
  items?: OrderItem[];
};

type Expense = {
  id: string;
  date: string;
  category?: string;
  description?: string;
  amount: number;
};

type DailyStats = {
  totalSales: number;
  orderCount: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  totalExpenses: number;
  estimatedProfit: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { from, to };
}

function getProductName(item: OrderItem): string {
  return item.productName ?? item.name ?? `Producto #${item.productId}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DailyReportExportProps {
  className?: string;
}

export default function DailyReportExport({ className }: DailyReportExportProps) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [error, setError] = useState(false);

  async function loadAndExport() {
    setLoading(true);
    setError(false);
    try {
      const { from, to } = todayRange();
      const dateLabel = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

      const [ordersRes, expensesRes] = await Promise.all([
        fetch(`/api/orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        fetch(`/api/expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      ]);

      const orders: Order[]   = ordersRes.ok   ? await ordersRes.json()   : [];
      const expenses: Expense[] = expensesRes.ok ? await expensesRes.json() : [];

      // Filtrar sólo pedidos completados del día
      const todayOrders = orders.filter(o => {
        const status = (o.status ?? "").toLowerCase();
        return status !== "cancelado" && status !== "cancelled";
      });

      const totalSales = todayOrders.reduce((s, o) => s + (o.total ?? 0), 0);
      const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);

      // Productos más vendidos
      const productTotals: Record<string, { name: string; qty: number; revenue: number }> = {};
      for (const order of todayOrders) {
        for (const item of order.items ?? []) {
          const name = getProductName(item);
          const key  = String(item.productId ?? name);
          if (!productTotals[key]) productTotals[key] = { name, qty: 0, revenue: 0 };
          productTotals[key].qty     += item.quantity ?? 0;
          productTotals[key].revenue += (item.price ?? 0) * (item.quantity ?? 0);
        }
      }
      const topProducts = Object.values(productTotals)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);

      const computedStats: DailyStats = {
        totalSales,
        orderCount: todayOrders.length,
        topProducts,
        totalExpenses,
        estimatedProfit: totalSales - totalExpenses,
      };
      setStats(computedStats);

      // ── Sheet 1: Ventas del día ──────────────────────────────────────────
      exportToCSV(
        todayOrders.map(o => ({
          hora: new Date(o.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
          cliente: o.customerName ?? "Cliente",
          total: o.total,
          metodo_pago: o.paymentMethod ?? "—",
          estado: o.status ?? "—",
        })),
        `reporte-ventas-${dateLabel}`,
      );

      // ── Sheet 2: Productos más vendidos ─────────────────────────────────
      if (topProducts.length > 0) {
        setTimeout(() => {
          exportToCSV(
            topProducts.map(p => ({
              producto: p.name,
              unidades_vendidas: p.qty,
              ingresos: p.revenue,
            })),
            `reporte-productos-${dateLabel}`,
          );
        }, 400);
      }

      // ── Sheet 3: Gastos del día ──────────────────────────────────────────
      if (expenses.length > 0) {
        setTimeout(() => {
          exportToCSV(
            expenses.map(e => ({
              hora: new Date(e.date).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
              categoria: e.category ?? "—",
              descripcion: e.description ?? "—",
              monto: e.amount,
            })),
            `reporte-gastos-${dateLabel}`,
          );
        }, 800);
      }

    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Acción principal */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={loadAndExport}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-bold transition-colors"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <FileSpreadsheet className="h-4 w-4" />}
          {loading ? "Generando reporte…" : "Descargar reporte del día"}
        </button>
        {error && (
          <p className="text-xs text-red-500 font-semibold">Error al cargar datos. Intenta de nuevo.</p>
        )}
        {!loading && !error && stats && (
          <p className="text-xs text-gray-400 dark:text-muted">
            Se generaron {[true, stats.topProducts.length > 0, stats.totalExpenses > 0].filter(Boolean).length} archivo(s) CSV
          </p>
        )}
      </div>

      {/* Preview de estadísticas */}
      {stats && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <p className="text-[10px] font-semibold text-gray-500 dark:text-muted uppercase">Ventas hoy</p>
            </div>
            <p className="text-lg font-extrabold text-emerald-600">{fmt(stats.totalSales)}</p>
            <p className="text-[10px] text-gray-400">{stats.orderCount} pedido{stats.orderCount !== 1 ? "s" : ""}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="h-4 w-4 text-emerald-600" />
              <p className="text-[10px] font-semibold text-gray-500 dark:text-muted uppercase">Top producto</p>
            </div>
            <p className="text-sm font-bold text-emerald-600 truncate">
              {stats.topProducts[0]?.name ?? "—"}
            </p>
            <p className="text-[10px] text-gray-400">
              {stats.topProducts[0] ? `${stats.topProducts[0].qty} unidades` : "Sin ventas"}
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Download className="h-4 w-4 text-red-500" />
              <p className="text-[10px] font-semibold text-gray-500 dark:text-muted uppercase">Gastos hoy</p>
            </div>
            <p className="text-lg font-extrabold text-red-500">{fmt(stats.totalExpenses)}</p>
          </div>
          <div className={cn(
            "rounded-2xl p-4",
            stats.estimatedProfit >= 0
              ? "bg-primary/10 dark:bg-primary/20"
              : "bg-red-50 dark:bg-red-900/20"
          )}>
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className={cn("h-4 w-4", stats.estimatedProfit >= 0 ? "text-primary" : "text-red-500")} />
              <p className="text-[10px] font-semibold text-gray-500 dark:text-muted uppercase">Utilidad est.</p>
            </div>
            <p className={cn(
              "text-lg font-extrabold",
              stats.estimatedProfit >= 0 ? "text-primary" : "text-red-500"
            )}>
              {fmt(stats.estimatedProfit)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
