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
  Tag,
  Wallet,
} from "lucide-react";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import DashboardDateRange, { getDefaultRange, type DateRange } from "@/components/admin/inicio/DashboardDateRange";
import dynamic from "next/dynamic";
import ChartSkeleton from "@/components/charts/ChartSkeleton";

// ── Lazy-loaded components (tab-gated, not immediately visible) ─────────────
const DashboardLoading = () => <ChartSkeleton height={400} label="Cargando dashboard..." />;
const InicioDashboard = dynamic(() => import("@/components/admin/inicio/InicioDashboard"), { ssr: false, loading: DashboardLoading });
const VendorKPICards = dynamic(() => import("@/components/admin/vendor-dashboard/VendorKPICards").then(m => ({ default: m.VendorKPICards })), { ssr: false });
const VendorPendingOrders = dynamic(() => import("@/components/admin/vendor-dashboard/VendorPendingOrders").then(m => ({ default: m.VendorPendingOrders })), { ssr: false });
const VendorLowStockList = dynamic(() => import("@/components/admin/vendor-dashboard/VendorLowStockList").then(m => ({ default: m.VendorLowStockList })), { ssr: false });
const VendorRecentSales = dynamic(() => import("@/components/admin/vendor-dashboard/VendorRecentSales").then(m => ({ default: m.VendorRecentSales })), { ssr: false });
const VendorWeeklyChart = dynamic(() => import("@/components/admin/vendor-dashboard/VendorWeeklyChart").then(m => ({ default: m.VendorWeeklyChart })), { ssr: false });
const VendorQuickActions = dynamic(() => import("@/components/admin/vendor-dashboard/VendorQuickActions").then(m => ({ default: m.VendorQuickActions })), { ssr: false });
const AdminMarketplaceOverview = dynamic(() => import("@/components/admin/unified/MarketplaceModule").then(m => ({ default: m.AdminMarketplaceOverview })), { ssr: false, loading: DashboardLoading });
const StockoutPredictionWidget = dynamic(() => import("@/components/marketplace/StockoutPredictionWidget"), { ssr: false });
const SponsoredAdminPanel = dynamic(() => import("@/components/marketplace/SponsoredAdminPanel"), { ssr: false });
const SalesAnomalyAlert = dynamic(() => import("@/components/marketplace/SalesAnomalyAlert"), { ssr: false });
const VentasDashboard = dynamic(() => import("@/components/admin/inicio/VentasDashboard"), { ssr: false, loading: DashboardLoading });
const CajaDashboard = dynamic(() => import("@/components/admin/inicio/CajaDashboard"), { ssr: false, loading: DashboardLoading });
const InventarioDashboard = dynamic(() => import("@/components/admin/inicio/InventarioDashboard"), { ssr: false, loading: DashboardLoading });
const ComprasDashboard = dynamic(() => import("@/components/admin/inicio/ComprasDashboard"), { ssr: false, loading: DashboardLoading });
const ProductosDashboard = dynamic(() => import("@/components/admin/inicio/ProductosDashboard"), { ssr: false, loading: DashboardLoading });
const ClientesDashboard = dynamic(() => import("@/components/admin/inicio/ClientesDashboard"), { ssr: false, loading: DashboardLoading });

const MODULE_ID = "vendor-dashboard";

type InicioTab = "general" | "ventas" | "caja" | "inventario" | "compras" | "productos" | "clientes" | "marketplace";

// ── Prefetch map: preload tab chunks on hover ──────────────────────────────
const TAB_PREFETCH: Record<InicioTab, () => void> = {
  general:     () => { void import("@/components/admin/inicio/InicioDashboard"); },
  ventas:      () => { void import("@/components/admin/inicio/VentasDashboard"); },
  caja:        () => { void import("@/components/admin/inicio/CajaDashboard"); },
  inventario:  () => { void import("@/components/admin/inicio/InventarioDashboard"); },
  compras:     () => { void import("@/components/admin/inicio/ComprasDashboard"); },
  productos:   () => { void import("@/components/admin/inicio/ProductosDashboard"); },
  clientes:    () => { void import("@/components/admin/inicio/ClientesDashboard"); },
  marketplace: () => { void import("@/components/admin/unified/MarketplaceModule"); },
};

const TABS: AdminTab[] = [
  { id: "general",     label: "Resumen",     icon: LayoutDashboard },
  { id: "ventas",      label: "Ventas",      icon: ShoppingCart },
  { id: "caja",        label: "Caja",        icon: Wallet },
  { id: "inventario",  label: "Inventario",  icon: Package },
  { id: "compras",     label: "Compras",     icon: Truck },
  { id: "productos",   label: "Productos",   icon: Tag },
  { id: "clientes",    label: "Clientes",    icon: Users },
  { id: "marketplace", label: "Marketplace", icon: Store },
];

function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-gray-100 rounded-2xl h-28 animate-pulse" />
      ))}
    </div>
  );
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-3">
      <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

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

  useEffect(() => {
    if (tab !== "marketplace") return;
    const interval = setInterval(() => { void fetchDashboard(true); }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDashboard, tab]);

  const TAB_DESCRIPTIONS: Record<InicioTab, string> = {
    general: "Resumen general con KPIs clave del negocio.",
    ventas: "Dashboard de ventas con tendencias y top productos.",
    caja: "Movimientos de caja, arqueos y flujo de efectivo.",
    inventario: "Stock critico, alertas de vencimiento y rotacion.",
    compras: "Compras a proveedores, deudas y ordenes.",
    productos: "Rendimiento de productos, categorias y margenes.",
    clientes: "Segmentacion de clientes, retencion y fidelizacion.",
    marketplace: lastUpdated
      ? `Marketplace actualizado a las ${lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`
      : "Panel consolidado del canal marketplace.",
  };

  return (
    <DashboardDataProvider>
    <div className="space-y-4">
      <AdminModuleHeader
        title="Inicio"
        description={TAB_DESCRIPTIONS[tab]}
        icon={LayoutDashboard}
        bgTint="bg-emerald-50 dark:bg-emerald-900/20"
        iconColorClass="text-emerald-600 dark:text-emerald-400"
      >
        {tab !== "marketplace" && (
          <DashboardDateRange value={dateRange} onChange={setDateRange} />
        )}
        {tab === "marketplace" && (
          <button
            onClick={() => void fetchDashboard(false)}
            disabled={loading}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
            title="Actualizar marketplace"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        )}
      </AdminModuleHeader>

      <AdminTabBar tabs={TABS} activeTab={tab} onTabChange={(t) => setTab(t as InicioTab)} onTabHover={(id) => TAB_PREFETCH[id as InicioTab]?.()} moduleId={MODULE_ID}>
        {tab === "general" && <InicioDashboard dateRange={dateRange} />}
        {tab === "ventas" && <VentasDashboard dateRange={dateRange} />}
        {tab === "caja" && <CajaDashboard dateRange={dateRange} />}
        {tab === "inventario" && <InventarioDashboard dateRange={dateRange} />}
        {tab === "compras" && <ComprasDashboard dateRange={dateRange} />}
        {tab === "productos" && <ProductosDashboard dateRange={dateRange} />}
        {tab === "clientes" && <ClientesDashboard dateRange={dateRange} />}

        {tab === "marketplace" && (
          <div className="space-y-4">
            <AdminMarketplaceOverview />

            {error && !data && (
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
                <p className="text-sm font-medium text-gray-700 text-center">{error}</p>
                <button
                  onClick={() => void fetchDashboard(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-emerald-600 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Reintentar
                </button>
              </div>
            )}

            {loading && !data && (
              <div className="space-y-4">
                <KPISkeleton />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <CardSkeleton rows={4} />
                  <CardSkeleton rows={4} />
                </div>
                <CardSkeleton rows={2} />
              </div>
            )}

            {!loading && data && (
              <div className="space-y-4">
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
              </div>
            )}
          </div>
        )}
      </AdminTabBar>
    </div>
    </DashboardDataProvider>
  );
}