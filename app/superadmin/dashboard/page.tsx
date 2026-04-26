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
import { TenantGrowthChart } from "@/components/superadmin/dashboard/TenantGrowthChart";
import ChartManager, { type ChartDefinition } from "@/components/admin/shared/ChartManager";
import {
  buildSparkline,
  buildARPUSeries,
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

interface WidgetsData {
  topStores: Array<{ tenantId: string; name: string; slug: string; plan: string; revenue: number; orders: number }>;
  funnel: Array<{ label: string; value: number }>;
  latestActive: Array<{ id: string; name: string; slug: string; plan: string; lastOrderAt: string | null; lastOrderTotal: number }>;
  revenueSeries: Array<{ date: string; revenue: number }>;
  ordersSeries: Array<{ date: string; count: number }>;
  arpuSeries?: Array<{ month: string; arpu: number }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [widgets, setWidgets] = useState<WidgetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<DateRange>("30d");
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);

  const handleCustomRange = useCallback((start: Date, end: Date) => {
    setCustomRange({ start, end });
    setRange("custom");
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [aRes, wRes] = await Promise.all([
        fetch("/api/superadmin/analytics", { credentials: "include" }),
        fetch("/api/superadmin/dashboard/widgets", { credentials: "include" }),
      ]);
      if (!aRes.ok) {
        setError("No se pudo cargar el dashboard. Reintentá.");
        return;
      }
      const json = (await aRes.json()) as AnalyticsData;
      setData(json);
      if (wRes.ok) {
        const w = (await wRes.json()) as WidgetsData;
        setWidgets(w);
      }
    } catch {
      setError("Error de red. Verificá la conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Series con datos REALES del endpoint widgets ────────────────────────
  // Recharts espera [{ date, value }] — adaptamos las shapes locales.
  const revenueSeries = useMemo(
    () =>
      widgets?.revenueSeries.map((p) => ({ date: p.date, revenue: p.revenue })) ??
      [],
    [widgets],
  );
  const ordersSeries = useMemo(
    () =>
      widgets?.ordersSeries.map((p) => ({ date: p.date, count: p.count })) ??
      [],
    [widgets],
  );
  const arpuSeries = useMemo(
    () =>
      widgets?.arpuSeries && widgets.arpuSeries.length > 0
        ? widgets.arpuSeries
        : data
          ? buildARPUSeries(data.overview.arpu)
          : [],
    [widgets, data],
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
          <DateRangeSelector
            value={range}
            onChange={setRange}
            customRange={customRange}
            onCustomRangeChange={handleCustomRange}
          />
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

      {/* ── ChartManager: hide/show + dynamic add ───────────────────────── */}
      {data && widgets && (
        <ChartManager
          moduleId="superadmin-dashboard"
          charts={[
            {
              id: "tenant-growth",
              label: "Crecimiento por tienda",
              description: "Multi-line chart con top 8 tiendas por volumen",
              section: "Crecimiento",
              component: (
                <TenantGrowthChart
                  range={
                    (["7d", "30d", "90d", "1y"] as const).includes(range as "7d" | "30d" | "90d" | "1y")
                      ? (range as "7d" | "30d" | "90d" | "1y")
                      : "30d"
                  }
                />
              ),
            },
            {
              id: "revenue-orders",
              label: "Ingresos & pedidos",
              description: "Revenue area + orders bar (últimos 30 días)",
              section: "Indicadores clave",
              component: (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 sm:gap-6">
                  <RevenueAreaChart
                    data={widgets.revenueSeries.map((p) => ({
                      month: p.date.slice(5),
                      revenue: p.revenue,
                    }))}
                  />
                  <OrdersBarChart
                    data={widgets.ordersSeries.map((p) => ({
                      day: p.date.slice(5),
                      orders: p.count,
                      label: p.date,
                    }))}
                  />
                </div>
              ),
            },
            {
              id: "top-funnel-arpu",
              label: "Top tiendas, funnel y ARPU",
              description: "Tres widgets compactos lado a lado",
              section: "Operación",
              component: (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 sm:gap-6">
                  <TopStoresList
                    stores={widgets.topStores.map((s) => ({
                      id: s.tenantId,
                      name: s.name,
                      slug: s.slug,
                      plan: (["free", "pro", "business", "enterprise"].includes(s.plan)
                        ? s.plan
                        : "free") as "free" | "pro" | "business" | "enterprise",
                      gmv: s.revenue,
                      orders: s.orders,
                    }))}
                  />
                  <ConversionFunnel
                    steps={widgets.funnel.map((f) => ({
                      key:
                        f.label === "Tiendas activas"
                          ? "visitas"
                          : f.label === "Con productos"
                            ? "carritos"
                            : f.label === "Con pedidos"
                              ? "checkouts"
                              : "pagados",
                      label: f.label,
                      value: f.value,
                    }))}
                  />
                  <ARPUMiniChart data={arpuSeries} currentARPU={data.overview.arpu} />
                </div>
              ),
            },
            {
              id: "latest-active",
              label: "Últimas tiendas activas",
              description: "Tabla ordenada por última actividad",
              section: "Detalle",
              component: (
                <LatestActiveTenantsTable
                  tenants={widgets.latestActive.map((t) => ({
                    id: t.id,
                    name: t.name,
                    slug: t.slug,
                    plan: (["free", "pro", "business", "enterprise"].includes(t.plan)
                      ? t.plan
                      : "free") as "free" | "pro" | "business" | "enterprise",
                    ordersThisMonth: 1,
                    revenueThisMonth: t.lastOrderTotal,
                    lastActiveAt: t.lastOrderAt ?? new Date().toISOString(),
                  }))}
                />
              ),
            },
          ]}
        />
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
