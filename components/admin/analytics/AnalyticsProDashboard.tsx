"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Product, Sale, Customer } from "@/types/erp";
import RevenueBreakdownChart from "./RevenueBreakdownChart";
import RFMSegmentationPanel from "./RFMSegmentationPanel";
import ProfitMarginAnalyzer from "./ProfitMarginAnalyzer";
import AnomalyDetector from "./AnomalyDetector";
import TrendForecaster from "./TrendForecaster";
import ProductPerformanceMatrix from "./ProductPerformanceMatrix";

// ── Types ──────────────────────────────────────────────────────────────────────
export type PeriodKey = "hoy" | "7d" | "30d" | "90d" | "custom";

export type OrderItem = { id: string; name: string; quantity: number; price: number };
export type Order = {
  id: string;
  customer?: { phone?: string };
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
};
export type Payable = { id: string; amount: number; paidAmount: number; status: string; dueDate: string };
export type Review  = { id: string; rating: number; createdAt: string };

export type DashData = {
  products: Product[];
  orders: Order[];
  sales: Sale[];
  customers: Customer[];
  payables: Payable[];
  reviews: Review[];
  alerts: { lowStock: number; pendingOrders: number; overduePayables: number };
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const PERIOD_LABELS: Record<PeriodKey, string> = {
  hoy: "Hoy",
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
  custom: "Personalizado",
};

const PERIOD_DAYS: Record<Exclude<PeriodKey, "custom">, number> = {
  hoy: 1, "7d": 7, "30d": 30, "90d": 90,
};

function filterByPeriod<T extends { createdAt: string }>(
  items: T[],
  period: PeriodKey,
  from: string,
  to: string
): T[] {
  const now = new Date();
  if (period === "custom") {
    const f = new Date(from);
    const t = new Date(to);
    t.setHours(23, 59, 59, 999);
    return items.filter((i) => {
      const d = new Date(i.createdAt);
      return d >= f && d <= t;
    });
  }
  const days = PERIOD_DAYS[period as Exclude<PeriodKey, "custom">];
  if (period === "hoy") {
    return items.filter((i) => new Date(i.createdAt).toDateString() === now.toDateString());
  }
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  return items.filter((i) => new Date(i.createdAt) >= cutoff);
}

// ── Widget Card Wrapper ────────────────────────────────────────────────────────
function WidgetCard({
  title,
  onRefresh,
  children,
  className,
}: {
  title: string;
  onRefresh?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [spinning, setSpinning] = useState(false);

  function handleRefresh() {
    if (!onRefresh) return;
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 800);
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-card",
        " flex flex-col overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-base)]">
        <span className="text-sm font-semibold text-gray-800 dark:text-foreground tracking-wide">
          {title}
        </span>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Actualizar"
          >
            <svg
              className={cn("w-4 h-4 text-gray-500 dark:text-gray-400", spinning && "animate-spin")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-1 p-5 min-h-[320px]">{children}</div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function AnalyticsProDashboard() {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, salesRes, customersRes] = await Promise.all([
        fetch("/api/admin/dashboard"),
        fetch("/api/sales?limit=500"),
        fetch("/api/customers"),
      ]);

      if (!dashRes.ok) throw new Error("Error al cargar el dashboard");
      if (!salesRes.ok) throw new Error("Error al cargar ventas");
      if (!customersRes.ok) throw new Error("Error al cargar clientes");

      const dash = await dashRes.json();
      const salesRaw = await salesRes.json();
      const customersRaw = await customersRes.json();

      const salesArr: Sale[] = Array.isArray(salesRaw) ? salesRaw : (salesRaw.sales ?? []);
      const customersArr: Customer[] = Array.isArray(customersRaw)
        ? customersRaw
        : (customersRaw.customers ?? []);

      setData({
        products: dash.products ?? [],
        orders: dash.orders ?? [],
        sales: salesArr,
        customers: customersArr,
        payables: dash.payables ?? [],
        reviews: dash.reviews ?? [],
        alerts: dash.alerts ?? { lowStock: 0, pendingOrders: 0, overduePayables: 0 },
      });
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh cada 5 minutos
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [fetchData]);

  // Filtered slices
  const filteredSales = data
    ? filterByPeriod(data.sales, period, customFrom, customTo)
    : [];
  const filteredOrders = data
    ? filterByPeriod(data.orders as Order[], period, customFrom, customTo)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground">
            Analytics Pro Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Actualizado: {lastRefreshed.toLocaleTimeString("es-PE")}
          </p>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={loading}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            "bg-[#00B4A6] text-white hover:bg-[#245a41] disabled:opacity-50"
          )}
        >
          <svg
            className={cn("w-4 h-4", loading && "animate-spin")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {loading ? "Cargando..." : "Actualizar todo"}
        </button>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
              period === key
                ? "bg-[#00B4A6] text-white border-[#00B4A6]"
                : "bg-white dark:bg-card text-gray-700 dark:text-gray-300 border-[var(--rule-base)] hover:border-[#00B4A6] hover:text-[#00B4A6]"
            )}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 text-sm rounded-lg border border-[var(--rule-base)] bg-white dark:bg-card text-gray-800 dark:text-foreground"
            />
            <span className="text-gray-500 dark:text-gray-400 text-sm">hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-2 py-1.5 text-sm rounded-lg border border-[var(--rule-base)] bg-white dark:bg-card text-gray-800 dark:text-foreground"
            />
          </div>
        )}
      </div>

      {/* Alerts bar */}
      {data?.alerts && (
        <div className="flex flex-wrap gap-3 mb-6">
          {data.alerts.lowStock > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
              <span className="font-medium">{data.alerts.lowStock}</span> productos con stock bajo
            </div>
          )}
          {data.alerts.pendingOrders > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm">
              <span className="font-medium">{data.alerts.pendingOrders}</span> pedidos pendientes
            </div>
          )}
          {data.alerts.overduePayables > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              <span className="font-medium">{data.alerts.overduePayables}</span> pagos vencidos
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          {error}. Verifica la conexion y vuelve a intentarlo.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Widget grid */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Row 1: Revenue (full width) */}
          <WidgetCard title="Desglose de Ingresos" onRefresh={fetchData} className="lg:col-span-2">
            <RevenueBreakdownChart sales={filteredSales} products={data.products} />
          </WidgetCard>

          {/* Row 2: Trend + Margins (half each) */}
          <WidgetCard title="Pronostico de Tendencia" onRefresh={fetchData}>
            <TrendForecaster sales={data.sales} />
          </WidgetCard>

          <WidgetCard title="Analisis de Margenes" onRefresh={fetchData}>
            <ProfitMarginAnalyzer products={data.products} sales={filteredSales} />
          </WidgetCard>

          {/* Row 3: BCG Matrix + Anomalies (half each) */}
          <WidgetCard title="Matriz de Productos (BCG)" onRefresh={fetchData}>
            <ProductPerformanceMatrix products={data.products} sales={filteredSales} />
          </WidgetCard>

          <WidgetCard title="Detector de Anomalias" onRefresh={fetchData}>
            <AnomalyDetector sales={filteredSales} orders={filteredOrders} />
          </WidgetCard>

          {/* Row 4: RFM (full width) */}
          <WidgetCard title="Segmentacion RFM de Clientes" onRefresh={fetchData} className="lg:col-span-2">
            <RFMSegmentationPanel customers={data.customers} sales={data.sales} />
          </WidgetCard>
        </div>
      )}

      {/* Footer note */}
      <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-600">
        Auto-actualiza cada 5 minutos. Periodo seleccionado: {PERIOD_LABELS[period]}
      </p>
    </div>
  );
}
