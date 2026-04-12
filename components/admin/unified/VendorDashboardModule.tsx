"use client";

import { useState, useEffect, useCallback } from "react";
import type { VendorDashboardData } from "@/components/admin/vendor-dashboard/vendor-dashboard.types";
import { VendorKPICards } from "@/components/admin/vendor-dashboard/VendorKPICards";
import { VendorPendingOrders } from "@/components/admin/vendor-dashboard/VendorPendingOrders";
import { VendorLowStockList } from "@/components/admin/vendor-dashboard/VendorLowStockList";
import { VendorRecentSales } from "@/components/admin/vendor-dashboard/VendorRecentSales";
import { VendorWeeklyChart } from "@/components/admin/vendor-dashboard/VendorWeeklyChart";
import { VendorQuickActions } from "@/components/admin/vendor-dashboard/VendorQuickActions";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { LayoutDashboard, RefreshCw, AlertTriangle } from "lucide-react";
import StockoutPredictionWidget from "@/components/marketplace/StockoutPredictionWidget";
import SponsoredAdminPanel from "@/components/marketplace/SponsoredAdminPanel";
import SalesAnomalyAlert from "@/components/marketplace/SalesAnomalyAlert";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";

// ── Módulo ────────────────────────────────────────────────────────────────────

const MODULE_ID = "vendor-dashboard";

const TABS = [
  { id: "resumen",  label: "Resumen",  icon: LayoutDashboard },
  { id: "pedidos",  label: "Pedidos",  icon: RefreshCw },
];

// ── Skeletons de carga ────────────────────────────────────────────────────────

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

// ── Auto-refresh ──────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000;

// ── Componente principal ──────────────────────────────────────────────────────

export default function VendorDashboardModule() {
  const [data, setData] = useState<VendorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tab, setTab] = useState("resumen");
  const [storeSlug, setStoreSlug] = useState("main");

  useEffect(() => {
    let active = true;

    void resolveActiveTenantSlug().then((resolved) => {
      if (active) setStoreSlug(resolved);
    });

    return () => {
      active = false;
    };
  }, []);

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/marketplace/vendor/dashboard", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }

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
    void fetchDashboard(false);
  }, [fetchDashboard]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchDashboard(true);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Mi Panel"
        description={
          lastUpdated
            ? `Actualizado a las ${lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`
            : "Vista ejecutiva de tu tienda"
        }
        icon={LayoutDashboard}
      >
        <button
          onClick={() => void fetchDashboard(false)}
          disabled={loading}
          className="p-2 rounded-lg text-gray-400 hover:text-[#00B4A6] hover:bg-[#00B4A6]/10 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Actualizar panel"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        moduleId={MODULE_ID}
      >
        {/* Estado de error */}
        {error && !data && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-sm font-medium text-gray-700 text-center">{error}</p>
            <button
              onClick={() => void fetchDashboard(false)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00B4A6] text-white text-sm font-bold hover:bg-teal-600 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        )}

        {/* Skeleton de carga inicial */}
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

        {/* Contenido — tab Resumen */}
        {!loading && data && tab === "resumen" && (
          <div className="space-y-4">
            {/* C3 — Anomalias de ventas */}
            <SalesAnomalyAlert storeSlug={storeSlug} />

            <VendorKPICards kpis={data.kpis} />
            <VendorQuickActions />

            {/* C1 — Riesgo de quiebre de stock */}
            <StockoutPredictionWidget storeSlug={storeSlug} />

            <VendorWeeklyChart data={data.weeklyRevenue} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <VendorPendingOrders orders={data.pendingOrders} />
              <VendorLowStockList products={data.lowStockProducts} />
            </div>
            <VendorRecentSales sales={data.recentSales} />

            {/* C5 — Productos patrocinados */}
            <SponsoredAdminPanel storeSlug={storeSlug} />
          </div>
        )}

        {/* Contenido — tab Pedidos */}
        {!loading && data && tab === "pedidos" && (
          <VendorPendingOrders orders={data.pendingOrders} />
        )}
      </AdminTabBar>
    </div>
  );
}
