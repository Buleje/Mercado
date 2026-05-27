"use client";

import { useState, useEffect, useCallback } from "react";
import type { VendorDashboardData } from "@/components/admin/vendor-dashboard/vendor-dashboard.types";
import { DashboardDataProvider } from "@/contexts/dashboard-data-context";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import {
  LayoutDashboard,
  RefreshCw,
  AlertTriangle,
  Store,
  ShoppingCart,
  Package,
  Truck,
  Users,
  Wallet,
} from "@buleje/design-system/icons";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import DashboardDateRange, { getDefaultRange, type DateRange } from "@/components/admin/inicio/DashboardDateRange";
import { ChartsVisibilityProvider, ChartsVisibilityButton } from "@/lib/admin/charts-visibility";
import dynamic from "next/dynamic";
import { BulejeLoader } from "@/components/admin/inicio/_shared";
import EmptyDateRangeState from "@/components/admin/inicio/EmptyDateRangeState";

// ── Lazy-loaded components (tab-gated, not immediately visible) ─────────────
const DashboardLoading = () => <BulejeLoader variant="card" size={48} label="Cargando dashboard..." />;
const VendorKPICards = dynamic(() => import("@/components/admin/vendor-dashboard/VendorKPICards").then(m => ({ default: m.VendorKPICards })), { ssr: false });
const VendorPendingOrders = dynamic(() => import("@/components/admin/vendor-dashboard/VendorPendingOrders").then(m => ({ default: m.VendorPendingOrders })), { ssr: false });
const VendorLowStockList = dynamic(() => import("@/components/admin/vendor-dashboard/VendorLowStockList").then(m => ({ default: m.VendorLowStockList })), { ssr: false });
const VendorRecentSales = dynamic(() => import("@/components/admin/vendor-dashboard/VendorRecentSales").then(m => ({ default: m.VendorRecentSales })), { ssr: false });
const VendorWeeklyChart = dynamic(() => import("@/components/admin/vendor-dashboard/VendorWeeklyChart").then(m => ({ default: m.VendorWeeklyChart })), { ssr: false });
const VendorQuickActions = dynamic(() => import("@/components/admin/vendor-dashboard/VendorQuickActions").then(m => ({ default: m.VendorQuickActions })), { ssr: false });
const StockoutPredictionWidget = dynamic(() => import("@/components/marketplace/StockoutPredictionWidget"), { ssr: false });
const SponsoredAdminPanel = dynamic(() => import("@/components/marketplace/SponsoredAdminPanel"), { ssr: false });
const SalesAnomalyAlert = dynamic(() => import("@/components/marketplace/SalesAnomalyAlert"), { ssr: false });
const MarketplaceAdvancedCharts = dynamic(
  () => import("@/components/admin/inicio/MarketplaceAdvancedCharts").then((m) => ({ default: m.MarketplaceAdvancedCharts })),
  { ssr: false, loading: DashboardLoading },
);
const VentasDashboard = dynamic(() => import("@/components/admin/inicio/VentasDashboard"), { ssr: false, loading: DashboardLoading });
const CajaDashboard = dynamic(() => import("@/components/admin/inicio/CajaDashboard"), { ssr: false, loading: DashboardLoading });
// Brandon mayo 2026: Productos e Inventario tenian KPIs duplicados (Valor
// Inventario, Stock Critico, Agotados, Sin Movimiento, Productos Activos).
// Se unificaron bajo la tab "Inventario". ProductosDashboard e
// InicioDashboard (v1) siguen disponibles para otros consumers pero ya
// no se montan en este modulo — la tab "general" usa V2.
const InventarioDashboard = dynamic(() => import("@/components/admin/inicio/InventarioDashboard"), { ssr: false, loading: DashboardLoading });
const ComprasDashboard = dynamic(() => import("@/components/admin/inicio/ComprasDashboard"), { ssr: false, loading: DashboardLoading });
const ClientesDashboard = dynamic(() => import("@/components/admin/inicio/ClientesDashboard"), { ssr: false, loading: DashboardLoading });

// ADR-064 Ola B — TodayHub hero unificado (drop-in al tab "general")
const TodayHub = dynamic(
  () => import("@/components/admin/hoy/TodayHub").then((m) => ({ default: m.TodayHub })),
  { ssr: false, loading: DashboardLoading },
);

// Brandon 2026-05-27 — "Inicio / Principal": command center con mini-resúmenes
// financieros (ingresos/gastos/ganancia) + accesos directos a módulos, en
// marco de computadora (estética del mockup de /negocios adaptada a desktop).
const VendorCommandCenter = dynamic(
  () => import("@/components/admin/inicio/VendorCommandCenter"),
  { ssr: false, loading: DashboardLoading },
);

// ADR-066 Ola M — InicioDashboardV2 con compound charts + multi-signal KPIs
const InicioDashboardV2 = dynamic(
  () => import("@/components/admin/inicio/InicioDashboardV2"),
  { ssr: false, loading: DashboardLoading },
);

// 2026-05-26 — briefing accionable embebido (reemplaza el modal "¡Buenos días!"
// bloqueante). Solo aparece si hay fiados/stock/pedidos por resolver.
const MorningBriefingCard = dynamic(
  () => import("@/components/admin/inicio/MorningBriefingCard"),
  { ssr: false },
);

const MODULE_ID = "vendor-dashboard";

type InicioTab = "general" | "ventas" | "caja" | "inventario" | "compras" | "clientes" | "marketplace";

// ── Prefetch map: preload tab chunks on hover ──────────────────────────────
const TAB_PREFETCH: Record<InicioTab, () => void> = {
  general:     () => { void import("@/components/admin/inicio/InicioDashboardV2"); },
  ventas:      () => { void import("@/components/admin/inicio/VentasDashboard"); },
  caja:        () => { void import("@/components/admin/inicio/CajaDashboard"); },
  inventario:  () => { void import("@/components/admin/inicio/InventarioDashboard"); },
  compras:     () => { void import("@/components/admin/inicio/ComprasDashboard"); },
  clientes:    () => { void import("@/components/admin/inicio/ClientesDashboard"); },
  marketplace: () => { void import("@/components/admin/unified/MarketplaceModule"); },
};

const TABS: AdminTab[] = [
  { id: "general",     label: "Resumen",     icon: LayoutDashboard },
  { id: "ventas",      label: "Ventas",      icon: ShoppingCart },
  { id: "caja",        label: "Caja",        icon: Wallet },
  { id: "inventario",  label: "Inventario",  icon: Package },
  { id: "compras",     label: "Compras",     icon: Truck },
  { id: "clientes",    label: "Clientes",    icon: Users },
  { id: "marketplace", label: "Marketplace", icon: Store },
];

const REFRESH_INTERVAL_MS = 30_000;

export default function VendorDashboardModule() {
  const [data, setData] = useState<VendorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tab, setTab] = useState<InicioTab>("general");
  const [storeSlug, setStoreSlug] = useState("main");
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);

  useEffect(() => {
    let active = true;
    void resolveActiveTenantSlug().then((resolved: string) => {
      if (active && resolved) setStoreSlug(resolved);
    });
    return () => { active = false; };
  }, []);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/vendor/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const json = (await res.json()) as VendorDashboardData;
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el panel");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "marketplace") return;
    void fetchDashboard(false);
  }, [fetchDashboard, tab]);

  // Brandon 2026-05-16 (audit P1): agregado visibility guard. Antes pollée
  // cada REFRESH_INTERVAL_MS aunque la pestaña estuviera oculta, gastando
  // red/CPU sin razón. Patrón espejo de MetasLogrosModule:248-263.
  useEffect(() => {
    if (tab !== "marketplace") return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!interval) interval = setInterval(() => { void fetchDashboard(true); }, REFRESH_INTERVAL_MS); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    if (typeof document !== "undefined" && document.visibilityState === "visible") start();
    const onVis = () => {
      if (document.visibilityState === "visible") { void fetchDashboard(true); start(); }
      else stop();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchDashboard, tab]);

  const rangeLabel: Record<string, string> = {
    diario: "de hoy",
    semanal: "de la semana",
    mensual: "del mes",
    anual: "del año",
    personalizado: "del período",
  };
  const rangeTxt = rangeLabel[dateRange.preset] ?? "del período";

  const TAB_DESCRIPTIONS: Record<InicioTab, string> = {
    general: `Resumen ${rangeTxt} con KPIs, ventas, caja, inventario y clientes vinculados.`,
    ventas: `Ventas ${rangeTxt}: tendencias, tickets y top productos.`,
    caja: `Movimientos de caja ${rangeTxt}: ingresos, egresos y flujo.`,
    inventario: `Inventario y catálogo ${rangeTxt}: stock crítico, rotación, agotados y unidades vendidas.`,
    compras: `Compras ${rangeTxt}: proveedores, deudas y órdenes.`,
    clientes: `Clientes ${rangeTxt}: nuevos, recurrentes y ticket promedio.`,
    marketplace: lastUpdated
      ? `Marketplace actualizado a las ${lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`
      : "Panel consolidado del canal marketplace.",
  };

  return (
    <DashboardDataProvider>
    {/* ChartsVisibilityProvider envuelve el módulo: cada tab tiene su propio
        scope porque cambiamos moduleId con la tab activa. localStorage
        persiste prefs por tab. */}
    <ChartsVisibilityProvider moduleId={`vendor-dashboard:${tab}`} key={tab}>
    <div className="space-y-4">
      <AdminModuleHeader
        title="Inicio"
        description={TAB_DESCRIPTIONS[tab]}
        icon={LayoutDashboard}
        bgTint="bg-[var(--accent-soft)]"
        iconColorClass="text-[var(--data-success-500)]"
      >
        {tab !== "marketplace" && (
          <div className="flex items-center gap-2 flex-wrap">
            <ChartsVisibilityButton />
            <DashboardDateRange value={dateRange} onChange={setDateRange} />
          </div>
        )}
        {tab === "marketplace" && (
          <button
            onClick={() => void fetchDashboard(false)}
            disabled={loading}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
            title="Actualizar marketplace"
            aria-label="Actualizar datos del marketplace"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        )}
      </AdminModuleHeader>

      <AdminTabBar tabs={TABS} activeTab={tab} onTabChange={(t) => setTab(t as InicioTab)} onTabHover={(id) => TAB_PREFETCH[id as InicioTab]?.()} moduleId={MODULE_ID}>
        {tab === "general" && (
          <div className="space-y-6">
            {/* Inicio / Principal — lo más importante de un vistazo:
                mini-resúmenes financieros + accesos directos a módulos. */}
            <VendorCommandCenter />
            {/* Briefing accionable del día (reemplaza el modal bloqueante).
                Se auto-oculta si no hay nada que resolver. */}
            <MorningBriefingCard />
            {/* Hub "Hoy" — saludo dinámico + hero KPI scoped al rango activo.
                hideAlerts=true porque InicioDashboardV2 las renderea side-by-side
                con la Meta del mes (v2 mayo 2026). */}
            <TodayHub dateRange={dateRange} hideAlerts />
            {/* Dashboard denso con compound charts + multi-signal KPIs scoped al rango */}
            <InicioDashboardV2 dateRange={dateRange} onChangeRange={setDateRange} />
          </div>
        )}
        {tab === "ventas" && <VentasDashboard dateRange={dateRange} onChangeRange={setDateRange} />}
        {tab === "caja" && <CajaDashboard dateRange={dateRange} onChangeRange={setDateRange} />}
        {tab === "inventario" && <InventarioDashboard dateRange={dateRange} onChangeRange={setDateRange} />}
        {tab === "compras" && <ComprasDashboard dateRange={dateRange} onChangeRange={setDateRange} />}
        {tab === "clientes" && <ClientesDashboard dateRange={dateRange} onChangeRange={setDateRange} />}

        {tab === "marketplace" && (
          <div className="space-y-6">
            {error && !data && (
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
                <p className="text-sm font-medium text-[var(--text-primary)] text-center">{error}</p>
                <button
                  onClick={() => void fetchDashboard(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-[var(--accent-soft)] transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Reintentar
                </button>
              </div>
            )}

            {loading && !data && (
              <BulejeLoader variant="card" size={56} label="Cargando marketplace..." />
            )}

            {!loading && data && (() => {
              // Brandon mayo 2026: si el vendor marketplace no tiene
              // actividad (sin ventas, pedidos ni weekly revenue), mostramos
              // un solo empty-state en vez del wall de KPIs en cero.
              const noActivity =
                data.kpis.salesToday === 0 &&
                data.kpis.salesYesterday === 0 &&
                data.kpis.salesLastWeek === 0 &&
                data.pendingOrders.length === 0 &&
                data.recentSales.length === 0 &&
                data.weeklyRevenue.every((d) => d.total === 0);
              if (noActivity) {
                return (
                  <EmptyDateRangeState
                    dateRange={dateRange}
                    metric="actividad de marketplace"
                    icon={Store}
                    title="Tu tienda todavía no tiene ventas en el marketplace"
                    description="Cuando tu primera venta entre desde el marketplace de Buleje, vas a ver acá ingresos por día, pedidos pendientes, top productos y predicción de quiebre de stock."
                    action={{ label: "Ver mis productos", href: "/admin?tab=inventario" }}
                  />
                );
              }
              return (
                <div className="space-y-6">
                  <SalesAnomalyAlert storeSlug={storeSlug} />
                  <VendorKPICards kpis={data.kpis} />
                  <VendorQuickActions />
                  <StockoutPredictionWidget storeSlug={storeSlug} />
                  <VendorWeeklyChart data={data.weeklyRevenue} />
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <VendorPendingOrders orders={data.pendingOrders} />
                    <VendorLowStockList products={data.lowStockProducts} />
                  </div>
                  <VendorRecentSales sales={data.recentSales} />
                  <SponsoredAdminPanel storeSlug={storeSlug} />

                  {/* ── Charts especializados marketplace (6 draggables: funnel, ingresos 6m, top productos, ratings, comparativa, heatmap) ── */}
                  <MarketplaceAdvancedCharts />
                </div>
              );
            })()}
          </div>
        )}
      </AdminTabBar>
    </div>
    </ChartsVisibilityProvider>
    </DashboardDataProvider>
  );
}