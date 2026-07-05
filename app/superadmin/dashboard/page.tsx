"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Banknote,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Minus,
} from "@buleje/design-system/icons";
import {
  StatCard,
  ErrorAlert,
  LoadingState,
} from "@buleje/design-system";
import { LayoutDashboard } from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { DateRangeSelector, type DateRange } from "@/components/superadmin/dashboard/DateRangeSelector";
import { TopStoresList } from "@/components/superadmin/dashboard/TopStoresList";
import { ConversionFunnel } from "@/components/superadmin/dashboard/ConversionFunnel";
import { LatestActiveTenantsTable } from "@/components/superadmin/dashboard/LatestActiveTenantsTable";
import { CommandCenterStrip } from "@/components/superadmin/dashboard/CommandCenterStrip";
import { FinancialResults } from "@/components/superadmin/dashboard/FinancialResults";
import dynamic from "next/dynamic";

// Audit P1 (2026-05-19): lazificación masiva de Recharts. Antes los 8 charts
// se cargaban eager en el bundle inicial del dashboard (~200KB de recharts +
// SVG paths). Ahora se cargan on-demand cuando el chart se monta.
// Skeleton h-64 con animate-pulse mantiene el layout estable.

const chartSkeleton = (h = "h-64") => (
  <div className={`${h} animate-pulse bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-soft)]`} />
);

const RevenueAreaChart = dynamic(
  () => import("@/components/superadmin/dashboard/RevenueAreaChart").then((m) => ({ default: m.RevenueAreaChart })),
  { ssr: false, loading: () => chartSkeleton("h-[300px]") },
);

const OrdersBarChart = dynamic(
  () => import("@/components/superadmin/dashboard/OrdersBarChart").then((m) => ({ default: m.OrdersBarChart })),
  { ssr: false, loading: () => chartSkeleton("h-[300px]") },
);

const ARPUMiniChart = dynamic(
  () => import("@/components/superadmin/dashboard/ARPUMiniChart").then((m) => ({ default: m.ARPUMiniChart })),
  { ssr: false, loading: () => chartSkeleton("h-32") },
);

const TenantGrowthChart = dynamic(
  () => import("@/components/superadmin/dashboard/TenantGrowthChart").then((m) => ({ default: m.TenantGrowthChart })),
  { ssr: false, loading: () => chartSkeleton("h-[360px]") },
);

const MonthlyOverviewChart = dynamic(
  () => import("@/components/superadmin/dashboard/MonthlyOverviewChart").then((m) => ({ default: m.MonthlyOverviewChart })),
  { ssr: false, loading: () => chartSkeleton("h-[300px]") },
);

const PlanDistributionDonut = dynamic(
  () =>
    import("@/components/superadmin/dashboard/PlanDistributionDonut").then(
      (m) => ({ default: m.PlanDistributionDonut }),
    ),
  { ssr: false, loading: () => chartSkeleton() },
);

const BusinessHealthRadial = dynamic(
  () =>
    import("@/components/superadmin/dashboard/BusinessHealthRadial").then(
      (m) => ({ default: m.BusinessHealthRadial }),
    ),
  { ssr: false, loading: () => chartSkeleton() },
);
import { KPIHeroCard } from "@/components/superadmin/dashboard/KPIHeroCard";
// 2026-05-19: Reemplazo ChartManager (estático, sin drag) por DraggableSections
// del admin/inicio. Es el mismo patrón que Brandon ya conoce — drag, hide,
// presentación fullscreen, persistencia en localStorage.
import { DraggableSections } from "@/components/admin/inicio/DraggableSections";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
// Audit P0 #4 (2026-05-19): `buildARPUSeries` se usaba como fallback cuando el
// endpoint devolvía vacío — eso filtraba datos sintéticos a producción. Ahora
// solo importamos `fmtSoles` (puro helper) y devolvemos `[]` cuando no hay datos
// reales — el chart muestra empty state honesto.
import { fmtSoles } from "@/lib/mocks/superadmin-dashboard.mock";

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
  latestActive: Array<{ id: string; name: string; slug: string; plan: string; lastOrderAt: string | null; lastOrderTotal: number; ordersThisMonth?: number; revenueThisMonth?: number }>;
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

  // Refetcha widgets cuando cambia el rango global del topbar. El endpoint
  // ya respeta ?range=7d|30d|90d|1y y devuelve series del window correcto.
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    const widgetsRange = range === "custom" || range === "all" ? "30d" : range;
    try {
      // Audit P0 #2: `fetchSuperadmin` redirige automáticamente a /login si la
      // sesión expira (401). El anterior `fetch()` directo dejaba al superadmin
      // viendo "Error" sin saber que su cookie había vencido.
      const [aRes, wRes] = await Promise.all([
        fetchSuperadmin("/api/superadmin/analytics"),
        fetchSuperadmin(`/api/superadmin/dashboard/widgets?range=${widgetsRange}`),
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
  }, [range]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Label dinámico para los charts según el rango activo. Se inyecta como
  // `description` a cada ChartWrapper, reemplazando los hardcoded "Últimos
  // 30 días" / "Últimos 12 meses".
  const rangeLabel = useMemo(() => {
    if (range === "7d") return "Últimos 7 días";
    if (range === "30d") return "Últimos 30 días";
    if (range === "90d") return "Últimos 90 días";
    if (range === "1y") return "Últimos 365 días";
    if (range === "all") return "Toda la historia";
    if (range === "custom" && customRange) {
      const fmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" });
      return `${fmt.format(customRange.start)} — ${fmt.format(customRange.end)}`;
    }
    return "Últimos 30 días";
  }, [range, customRange]);

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

  // ── Formato fecha legible — "2026-04-23" → "23 abr" ────────────────────
  // Brief Brandon 2026-05-19: "04-23" no se entiende; queremos "2 may" con
  // abreviación en español. Usa Intl en es-PE (e.g. "23 abr"). Es el formato
  // que Brandon ya usa mentalmente cuando habla del negocio.
  const fmtShortDate = useCallback((iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const day = d.getDate();
      const monthRaw = new Intl.DateTimeFormat("es-PE", { month: "short" })
        .format(d)
        .replace(/\.$/, "");
      // Capitalizar mes para consistencia entre charts (Intl devuelve
      // minúsculas en es-PE: "abr" → "Abr")
      const month = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1);
      return `${day} ${month}`;
    } catch {
      return iso;
    }
  }, []);
  // Audit P0 #4 — datos REALES siempre. Si el endpoint no devuelve serie ARPU,
  // mostramos array vacío en lugar de sintéticos del mock. ARPUMiniChart maneja
  // el empty state internamente (no renderiza chart, muestra valor actual).
  const arpuSeries = useMemo(
    () => widgets?.arpuSeries ?? [],
    [widgets],
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
      info={{
        what: "Resumen ejecutivo en tiempo real: MRR, ARR, tiendas activas, pedidos del mes y top tiendas por volumen.",
        affects: "Solo visible en el superadmin. Los KPIs se calculan en el backend con datos reales de todos los tenants.",
        example: "Si este mes se sumaron 3 nuevas tiendas Pro, el MRR sube y el gráfico de crecimiento lo refleja automáticamente.",
      }}
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
      {/* ── Resumen ejecutivo: el TL;DR del negocio en una línea ────────── */}
      {data && <ExecutiveSummary data={data} />}

      {/* ── Resultado financiero: ingresos vs gastos → bruta, neta, final ── */}
      {data && (
        <FinancialResults
          mrrPen={data.overview.mrr}
          mrrGrowthPct={data.growth.mrrGrowthPct}
          payingTenants={data.overview.payingTenants}
        />
      )}

      {/* ── Centro de comando: KPIs operativos accionables (auto-fetch) ──── */}
      <CommandCenterStrip />

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
            // Brandon 2026-05-21 audit fix #7: el delta es "tenants NUEVOS
            // este mes vs anterior". Si todos los tenants se crearon antes
            // del periodo actual, tenantsThisMonth=0 y el cálculo da -100%
            // (matemáticamente correcto pero engañoso porque el label dice
            // "Tiendas activas" no "nuevas"). Suprimimos el delta cuando
            // es exactamente -100% (caso "0 nuevos este mes, había en el
            // anterior") para no confundir al user.
            delta={data.growth.tenantGrowthPct === -100 ? null : data.growth.tenantGrowthPct}
            deltaLabel="nuevos vs mes anterior"
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

      {/* ── DraggableSections: drag + hide + presentación fullscreen ──────
          Brandon 2026-05-19: misma UX del admin/inicio — botón "Presentar"
          en cada card (Maximize2), drag handle, persistencia local.
          Todos los charts comparten `rangeLabel` derivado del filtro arriba. */}
      {data && widgets && (
        <DraggableSections
          storageKey="superadmin-dashboard-order"
          layout="column"
          gap={1.25}
          items={[
            {
              id: "tenant-growth",
              title: "Crecimiento por tienda",
              span: "full",
              render: () => (
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
              title: "Visión mensual",
              span: "full",
              render: () =>
                monthlyOverview.length > 0 ? (
                  <MonthlyOverviewChart data={monthlyOverview} description={rangeLabel} />
                ) : null,
            },
            {
              id: "plan-health",
              title: "Distribución y salud",
              span: "full",
              render: () => (
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
              title: "Detalle diario",
              span: "full",
              render: () => (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 sm:gap-6">
                  <RevenueAreaChart
                    data={widgets.revenueSeries.map((p) => ({
                      month: fmtShortDate(p.date),
                      revenue: p.revenue,
                    }))}
                    description={rangeLabel}
                  />
                  <OrdersBarChart
                    data={widgets.ordersSeries.map((p) => ({
                      day: fmtShortDate(p.date),
                      orders: p.count,
                      label: p.date,
                    }))}
                    description={rangeLabel}
                  />
                </div>
              ),
            },
            {
              id: "top-funnel",
              title: "Top tiendas y funnel",
              span: "full",
              render: () => (
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
                    description={rangeLabel}
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
                    description={rangeLabel}
                  />
                </div>
              ),
            },
            {
              id: "latest-active",
              title: "Últimas tiendas activas",
              span: "full",
              render: () => (
                <LatestActiveTenantsTable
                  tenants={widgets.latestActive.map((t) => ({
                    id: t.id,
                    name: t.name,
                    slug: t.slug,
                    plan: (["free", "pro", "business", "enterprise"].includes(t.plan)
                      ? t.plan
                      : "free") as "free" | "pro" | "business" | "enterprise",
                    // Brandon 2026-05-21 audit fix #6: usar datos reales
                    // del groupBy server (antes hardcoded 1 + lastOrderTotal).
                    ordersThisMonth: t.ordersThisMonth ?? 0,
                    revenueThisMonth: t.revenueThisMonth ?? t.lastOrderTotal ?? 0,
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

/**
 * ExecutiveSummary — TL;DR del negocio en una línea. Lee los datos que la
 * página ya tiene (sin fetch extra) y da un veredicto de salud + la narrativa
 * con los números clave resaltados. Lo primero que ve el superadmin.
 */
function ExecutiveSummary({ data }: { data: AnalyticsData }) {
  const total = data.overview.totalTenants;
  const paying = data.overview.payingTenants;
  const atRisk = data.atRiskCount ?? 0;
  const orders = data.growth.ordersThisMonth;
  const mrrPct = data.growth.mrrGrowthPct;
  const riskRatio = total > 0 ? atRisk / total : 0;

  const health =
    riskRatio >= 0.6 ? "attention" : riskRatio >= 0.3 ? "watch" : "healthy";
  const HEALTH = {
    healthy: { label: "Negocio saludable", icon: CheckCircle2, chip: "bg-[var(--data-success-50)] text-[var(--data-success-700)]", border: "border-[var(--data-success-500)]/30", iconc: "text-[var(--data-success-500)]" },
    watch: { label: "Salud estable — vigilá el riesgo", icon: AlertTriangle, chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", border: "border-amber-400/30", iconc: "text-amber-500" },
    attention: { label: "Requiere atención", icon: AlertTriangle, chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", border: "border-amber-400/40", iconc: "text-amber-500" },
  }[health];
  const Icon = HEALTH.icon;

  const TrendIcon = mrrPct > 0.5 ? TrendingUp : mrrPct < -0.5 ? TrendingDown : Minus;
  const trendTone = mrrPct > 0.5 ? "text-[var(--data-success-500)]" : mrrPct < -0.5 ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]";
  const trendText = mrrPct > 0.5 ? `+${mrrPct.toFixed(1)}%` : mrrPct < -0.5 ? `${mrrPct.toFixed(1)}%` : "estable";

  return (
    <section aria-label="Resumen ejecutivo" className={`mb-5 rounded-2xl border-2 ${HEALTH.border} bg-[var(--surface-raised)] p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${HEALTH.chip}`}>
          <Icon className="h-6 w-6" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">{HEALTH.label}</p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            MRR <strong className="text-[var(--text-primary)] tabular-nums">{fmtSoles(data.overview.mrr)}</strong>{" "}
            <span className={`inline-flex items-center gap-0.5 font-semibold ${trendTone}`}>
              <TrendIcon className="h-3.5 w-3.5" aria-hidden />{trendText}
            </span>{" "}
            · <strong className="text-[var(--text-primary)]">{paying}</strong> de pago de{" "}
            <strong className="text-[var(--text-primary)]">{total}</strong> tiendas ·{" "}
            {atRisk > 0
              ? <strong className={health === "healthy" ? "text-[var(--text-primary)]" : "text-amber-600 dark:text-amber-400"}>{atRisk} en riesgo</strong>
              : <span className="text-[var(--data-success-500)] font-semibold">sin riesgos</span>}{" "}
            · <strong className="text-[var(--text-primary)] tabular-nums">{orders.toLocaleString("es-PE")}</strong> pedidos este mes
          </p>
        </div>
      </div>
    </section>
  );
}
