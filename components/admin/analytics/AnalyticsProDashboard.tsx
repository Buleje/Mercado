"use client";

import { PageTitle } from "@buleje/design-system";
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
        "rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-[var(--surface-raised)]",
        " flex flex-col overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-base)]">
        <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] tracking-wide">
          {title}
        </span>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-700 transition-colors"
            aria-label="Actualizar"
          >
            <svg
              className={cn("w-4 h-4 text-[var(--text-tertiary)]", spinning && "animate-spin")}
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
    <div className="min-h-screen bg-[var(--surface-alt)] dark:bg-surface p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <PageTitle className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            Analytics Pro Dashboard
          </PageTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Actualizado: {lastRefreshed.toLocaleTimeString("es-PE")}
          </p>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={loading}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            "bg-primary text-white hover:bg-primary-dark disabled:opacity-50"
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
                ? "bg-primary text-white border-primary"
                : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-primary hover:text-primary"
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
              className="px-2 py-1.5 text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
            />
            <span className="text-[var(--text-tertiary)] text-sm">hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-2 py-1.5 text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
            />
          </div>
        )}
      </div>

      {/* Alerts bar */}
      {data?.alerts && (
        <div className="flex flex-wrap gap-3 mb-6">
          {data.alerts.lowStock > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-sm">
              <span className="font-medium">{data.alerts.lowStock}</span> productos con stock bajo
            </div>
          )}
          {data.alerts.pendingOrders > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-sm">
              <span className="font-medium">{data.alerts.pendingOrders}</span> pedidos pendientes
            </div>
          )}
          {data.alerts.overduePayables > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-sm">
              <span className="font-medium">{data.alerts.overduePayables}</span> pagos vencidos
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-sm">
          {error}. Verifica la conexion y vuelve a intentarlo.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-xl bg-[var(--rule-soft)] dark:bg-gray-700 animate-pulse"
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

          <WidgetCard title="Análisis de Margenes" onRefresh={fetchData}>
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
      <p className="mt-6 text-center text-xs text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
        Auto-actualiza cada 5 minutos. Periodo seleccionado: {PERIOD_LABELS[period]}
      </p>
    </div>
  );
}
