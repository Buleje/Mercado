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
  ErrorAlert,
  LoadingState,
} from "@buleje/design-system";
import { LayoutDashboard } from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { DateRangeSelector, type DateRange } from "@/components/superadmin/dashboard/DateRangeSelector";
import { RevenueAreaChart } from "@/components/superadmin/dashboard/RevenueAreaChart";
import { OrdersBarChart } from "@/components/superadmin/dashboard/OrdersBarChart";
import { TopStoresList } from "@/components/superadmin/dashboard/TopStoresList";
import { ConversionFunnel } from "@/components/superadmin/dashboard/ConversionFunnel";
import { ARPUMiniChart } from "@/components/superadmin/dashboard/ARPUMiniChart";
import { LatestActiveTenantsTable } from "@/components/superadmin/dashboard/LatestActiveTenantsTable";
import { TenantGrowthChart } from "@/components/superadmin/dashboard/TenantGrowthChart";
import { MonthlyOverviewChart } from "@/components/superadmin/dashboard/MonthlyOverviewChart";
import { PlanDistributionDonut } from "@/components/superadmin/dashboard/PlanDistributionDonut";
import { BusinessHealthRadial } from "@/components/superadmin/dashboard/BusinessHealthRadial";
import { KPIHeroCard } from "@/components/superadmin/dashboard/KPIHeroCard";
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
    churnRate?: number;
    trialConversionRate?: number;
  };
  growth: {
    tenantsThisMonth: number;
    tenantGrowthPct: number;
    ordersThisMonth: number;
    orderGrowthPct: number;
    mrrGrowthPct: number;
  };
  totals: {
    totalOrders: number;
    totalProducts: number;
    totalAdminUsers: number;
  };
  planDistribution?: { free: number; pro: number; business: number; enterprise: number };
  monthlySignups?: Array<{ month: string; count: number }>;
  monthlyRevenue?: Array<{ month: string; revenue: number }>;
  atRiskCount?: number;
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

  // ── Series mensual combinada (revenue + signups) ────────────────────────
  const monthlyOverview = useMemo(() => {
    if (!data?.monthlyRevenue || !data?.monthlySignups) return [];
    const revMap = new Map(data.monthlyRevenue.map((r) => [r.month, r.revenue]));
    const signMap = new Map(data.monthlySignups.map((r) => [r.month, r.count]));
    const months = Array.from(new Set([...revMap.keys(), ...signMap.keys()]));
    return months.map((m) => ({
      month: m,
      revenue: revMap.get(m) ?? 0,
      signups: signMap.get(m) ?? 0,
    }));
  }, [data]);

  // ── Sparklines hero KPIs (series REALES del endpoint widgets) ─────────────
  // Audit P0-B 2026-05-02: antes usábamos `buildSparkline()` que generaba
  // curvas sintéticas alrededor del valor actual — engañaba al superadmin
  // con tendencias falsas. Ahora derivamos las series del endpoint widgets
  // (revenueSeries 30d, ordersSeries 30d, monthlyRevenue 6m, monthlySignups
  // 6m). Si una serie está vacía o tiene <2 puntos, omitimos el sparkline
  // (el StatCard no renderiza nada — más honesto que mostrar tendencia falsa).
  const sparks = useMemo(() => {
    if (!data) return null;
    const revSeries = widgets?.revenueSeries.map((p) => p.revenue) ?? [];
    const ordSeries = widgets?.ordersSeries.map((p) => p.count) ?? [];
    const monthlyRev = data.monthlyRevenue?.map((r) => r.revenue) ?? [];
    const monthlySign = data.monthlySignups?.map((r) => r.count) ?? [];
    return {
      mrr: monthlyRev.length >= 2 ? monthlyRev : revSeries,
      arr: monthlyRev.length >= 2 ? monthlyRev : revSeries,
      tenants: monthlySign.length >= 2 ? monthlySign : [],
      orders: ordSeries,
    };
  }, [data, widgets]);

  return (
    <AdminTabShell
      title="Dashboard ejecutivo"
      description="Vista global del negocio SaaS · MRR, ARR, crecimiento de tenants y top stores."
      icon={LayoutDashboard}
      kicker="Plataforma Buleje"
      actions={
        <>
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
        </>
      }
    >
      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <ErrorAlert
          title="Error al cargar"
          description={error}
          action={
            <button
              type="button"
              onClick={() => void loadData()}
              className="text-[length:var(--ts-xs)] font-semibold text-[var(--data-error-500)] underline hover:no-underline"
            >
              Reintentar
            </button>
          }
        />
      )}

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && !data && <LoadingState message="Cargando indicadores..." />}

      {/* ── Fila 1: 4 KPIs hero con sparklines + paleta diferenciada ──── */}
      {data && sparks && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
          <KPIHeroCard
            label="MRR"
            value={fmtSoles(data.overview.mrr)}
            icon={TrendingUp}
            tone="teal"
            delta={data.growth.mrrGrowthPct}
            deltaLabel="vs mes anterior"
            sparkline={sparks.mrr}
          />
          <KPIHeroCard
            label="ARR estimado"
            value={fmtSoles(data.overview.arr)}
            icon={Banknote}
            tone="sky"
            subValue={`${data.overview.payingTenants} tenants de pago`}
            sparkline={sparks.arr}
          />
          <KPIHeroCard
            label="Tiendas activas"
            value={data.overview.activeTenants}
            icon={Building2}
            tone="amber"
            delta={data.growth.tenantGrowthPct}
            deltaLabel="vs mes anterior"
            subValue={`${data.overview.totalTenants} totales`}
            sparkline={sparks.tenants}
          />
          <KPIHeroCard
            label="Pedidos este mes"
            value={data.growth.ordersThisMonth.toLocaleString("es-PE")}
            icon={ShoppingBag}
            tone="purple"
            delta={data.growth.orderGrowthPct}
            deltaLabel="vs mes anterior"
            sparkline={sparks.orders}
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
              id: "monthly-overview",
              label: "Visión mensual",
              description: "Ingresos + nuevas tiendas por mes (composed chart)",
              section: "Indicadores clave",
              component: monthlyOverview.length > 0 ? (
                <MonthlyOverviewChart data={monthlyOverview} />
              ) : null,
            },
            {
              id: "plan-health",
              label: "Distribución y salud",
              description: "Plan donut + radial de salud + ARPU",
              section: "Indicadores clave",
              component: (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 sm:gap-6">
                  <PlanDistributionDonut
                    distribution={
                      data.planDistribution ?? { free: 0, pro: 0, business: 0, enterprise: 0 }
                    }
                  />
                  <BusinessHealthRadial
                    trialConversionRate={data.overview.trialConversionRate ?? 0}
                    churnRate={data.overview.churnRate ?? 0}
                    activeTenants={data.overview.activeTenants}
                    totalTenants={data.overview.totalTenants}
                    atRiskCount={data.atRiskCount ?? 0}
                  />
                  <ARPUMiniChart data={arpuSeries} currentARPU={data.overview.arpu} />
                </div>
              ),
            },
            {
              id: "revenue-orders",
              label: "Detalle diario",
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
              id: "top-funnel",
              label: "Top tiendas y funnel",
              description: "Top 5 + conversión por paso",
              section: "Operación",
              component: (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 sm:gap-6">
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
    </AdminTabShell>
  );
}
