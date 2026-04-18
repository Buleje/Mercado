"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  TrendingUp,
  ShoppingBag,
  Banknote,
  RefreshCw,
  ArrowRight,
} from "@buleje/design-system/icons";
import {
  StatCard,
  PageTitle,
  Caption,
  Kicker,
  ErrorAlert,
  LoadingState,
} from "@buleje/design-system";
import { DateRangeSelector, type DateRange } from "@/components/superadmin/dashboard/DateRangeSelector";
import { RevenueAreaChart } from "@/components/superadmin/dashboard/RevenueAreaChart";
import { OrdersBarChart } from "@/components/superadmin/dashboard/OrdersBarChart";
import { TopStoresList } from "@/components/superadmin/dashboard/TopStoresList";
import { ConversionFunnel } from "@/components/superadmin/dashboard/ConversionFunnel";
import { ARPUMiniChart } from "@/components/superadmin/dashboard/ARPUMiniChart";
import { LatestActiveTenantsTable } from "@/components/superadmin/dashboard/LatestActiveTenantsTable";
import {
  buildRevenueSeries,
  buildOrdersSeries,
  buildSparkline,
  buildARPUSeries,
  TOP_STORES_MOCK,
  FUNNEL_MOCK,
  LATEST_ACTIVE_TENANTS,
  fmtSoles,
} from "@/lib/mocks/superadmin-dashboard.mock";

interface AnalyticsData {
  overview: {
    totalTenants: number;
    activeTenants: number;
    payingTenants: number;
    mrr: number;
    arr: number;
    arpu: number;
  };
  growth: {
    tenantsThisMonth: number;
    tenantGrowthPct: number;
    ordersThisMonth: number;
    orderGrowthPct: number;
  };
  totals: {
    totalOrders: number;
    totalProducts: number;
    totalAdminUsers: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<DateRange>("30d");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/analytics", { credentials: "include" });
      if (!res.ok) {
        setError("No se pudo cargar el dashboard. Reintentá.");
        return;
      }
      const json = (await res.json()) as AnalyticsData;
      setData(json);
    } catch {
      setError("Error de red. Verificá la conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Series deterministas derivadas del overview real ───────────────────────
  const revenueSeries = useMemo(
    () => (data ? buildRevenueSeries(data.overview.mrr) : []),
    [data],
  );
  const ordersSeries = useMemo(
    () => (data ? buildOrdersSeries(Math.max(data.growth.ordersThisMonth, 30)) : []),
    [data],
  );
  const arpuSeries = useMemo(
    () => (data ? buildARPUSeries(data.overview.arpu) : []),
    [data],
  );

  // ── Sparklines hero KPIs ────────────────────────────────────────────────────
  const sparks = useMemo(() => {
    if (!data) return null;
    return {
      mrr: buildSparkline(data.overview.mrr, "up"),
      arr: buildSparkline(data.overview.arr, "up"),
      tenants: buildSparkline(data.overview.activeTenants, "up"),
      orders: buildSparkline(
        data.growth.ordersThisMonth,
        data.growth.orderGrowthPct >= 0 ? "up" : "down",
      ),
    };
  }, [data]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Kicker>Plataforma Buleje</Kicker>
          <PageTitle className="mt-1">Dashboard ejecutivo</PageTitle>
          <Caption className="mt-1 block">Vista global del negocio SaaS.</Caption>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeSelector value={range} onChange={setRange} />
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <ErrorAlert
          title="Error al cargar"
          description={error}
          action={
            <button
              type="button"
              onClick={() => void loadData()}
              className="text-[length:var(--ts-xs)] font-semibold text-[var(--data-error)] underline hover:no-underline"
            >
              Reintentar
            </button>
          }
        />
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && !data && <LoadingState message="Cargando indicadores..." />}

      {/* ── Fila 1: 4 KPIs hero con sparklines ───────────────────────────── */}
      {data && sparks && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
          <StatCard
            label="MRR"
            value={fmtSoles(data.overview.mrr)}
            icon={TrendingUp}
            density="comfortable"
            delta={data.growth.tenantGrowthPct}
            deltaLabel="vs mes anterior"
            sparkline={{ data: sparks.mrr, color: "var(--accent, var(--text-primary))" }}
          />
          <StatCard
            label="ARR estimado"
            value={fmtSoles(data.overview.arr)}
            icon={Banknote}
            density="comfortable"
            subValue={`${data.overview.payingTenants} tenants de pago`}
            sparkline={{ data: sparks.arr, color: "var(--accent, var(--text-primary))" }}
          />
          <StatCard
            label="Tiendas activas"
            value={data.overview.activeTenants}
            icon={Building2}
            density="comfortable"
            delta={data.growth.tenantGrowthPct}
            deltaLabel="vs mes anterior"
            subValue={`${data.overview.totalTenants} totales`}
            sparkline={{ data: sparks.tenants, color: "var(--accent, var(--text-primary))" }}
          />
          <StatCard
            label="Pedidos este mes"
            value={data.growth.ordersThisMonth.toLocaleString("es-PE")}
            icon={ShoppingBag}
            density="comfortable"
            delta={data.growth.orderGrowthPct}
            deltaLabel="vs mes anterior"
            sparkline={{ data: sparks.orders, color: "var(--accent, var(--text-primary))" }}
          />
        </div>
      )}

      {/* ── Fila 2: Revenue + Orders charts lado a lado ──────────────────── */}
      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 sm:gap-6">
          {/* MOCK — reemplazar con endpoint real /api/superadmin/dashboard/revenue-series */}
          <RevenueAreaChart data={revenueSeries} />
          {/* MOCK — reemplazar con endpoint real /api/superadmin/dashboard/orders-series */}
          <OrdersBarChart data={ordersSeries} />
        </div>
      )}

      {/* ── Fila 3: Top stores + Funnel + ARPU ───────────────────────────── */}
      {data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 sm:gap-6">
          {/* MOCK — reemplazar con /api/superadmin/dashboard/top-stores */}
          <TopStoresList stores={TOP_STORES_MOCK} />
          {/* MOCK — reemplazar con /api/superadmin/dashboard/funnel */}
          <ConversionFunnel steps={FUNNEL_MOCK} />
          {/* MOCK — reemplazar con /api/superadmin/dashboard/arpu-series */}
          <ARPUMiniChart data={arpuSeries} currentARPU={data.overview.arpu} />
        </div>
      )}

      {/* ── Fila 4: Tabla últimas tiendas activas ────────────────────────── */}
      {data && (
        // MOCK — reemplazar con /api/superadmin/dashboard/latest-active
        <LatestActiveTenantsTable tenants={LATEST_ACTIVE_TENANTS} />
      )}

      {/* ── Footer: link a analytics detallado ───────────────────────────── */}
      {data && (
        <div className="flex justify-end pt-2">
          <Link
            href="/superadmin/analytics"
            className="inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Ver analytics detallado
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
