"use client";

/**
 * Pestaña «Marketplace» del Inicio (`?tab=vendor-dashboard&vista=marketplace`).
 *
 * Orden por pregunta (ley de la vista): cómo va hoy + acciones → qué atender
 * (pedidos y stock bajo) → la semana → pedidos de hoy → riesgo de quiebre →
 * gráficos de 30 días / 6 meses → productos patrocinados.
 *
 * Regla R1 del Inicio (Brandon 2026-10-09): sin NINGÚN dato → sólo el paiche
 * (`EmptyDateRangeState`), sin muro de tarjetas en cero. «Dato» = una venta
 * (hoy, ayer o hace 7 días), un pedido por atender, un pedido de hoy, una
 * venta en los 7 días, o algún pedido/reseña en el tablero de 30 días-6 meses.
 * El stock bajo solo no cuenta (es inventario, no actividad del marketplace).
 * Esta pestaña no usa el selector de período: cada bloque dice su ventana.
 */

import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { BulejeLoader } from "@/components/admin/inicio/_shared";
import EmptyDateRangeState from "@/components/admin/inicio/EmptyDateRangeState";
import { getDefaultRange } from "@/components/admin/inicio/DashboardDateRange";
import type { VendorDashboardData } from "./vendor-dashboard.types";
import { hayActividadMarketplace } from "./marketplace-metricas";
import { VendorKPICards } from "./VendorKPICards";
import { VendorLowStockList } from "./VendorLowStockList";
import { VendorRecentSales } from "./VendorRecentSales";
import { VendorWeeklyChart } from "./VendorWeeklyChart";

const VendorPendingOrders = dynamic(() => import("./VendorPendingOrders").then((m) => ({ default: m.VendorPendingOrders })), { ssr: false });
const StockoutPredictionWidget = dynamic(() => import("@/components/marketplace/StockoutPredictionWidget"), { ssr: false });
const SponsoredAdminPanel = dynamic(() => import("@/components/marketplace/SponsoredAdminPanel"), { ssr: false });
const SalesAnomalyAlert = dynamic(() => import("@/components/marketplace/SalesAnomalyAlert"), { ssr: false });
const MarketplaceAdvancedCharts = dynamic(
  () => import("@/components/admin/inicio/MarketplaceAdvancedCharts").then((m) => ({ default: m.MarketplaceAdvancedCharts })),
  { ssr: false },
);

export function VendorMarketplaceTab({ data, storeSlug }: { data: VendorDashboardData; storeSlug: string }) {
  const { data: tablero, loading: cargandoTablero } = useDashboardData();
  const actividad = hayActividadMarketplace(data, tablero?.orders ?? [], tablero?.reviews ?? []);

  // Sin actividad del vendedor y el tablero de 30 días todavía llegando: esperar
  // antes de decidir, para no mostrar el paiche y después los gráficos.
  if (!actividad && cargandoTablero) return <BulejeLoader variant="card" size={56} label="Cargando marketplace..." />;

  if (!actividad) {
    return (
      <EmptyDateRangeState
        dateRange={getDefaultRange()}
        title="Tu tienda todavía no vende en el marketplace"
        description="Cuando entre tu primer pedido vas a ver acá tus ventas, lo que tienes por atender y lo más vendido."
        action={{ label: "Ver mis productos", href: "/admin?tab=productos" }}
      />
    );
  }

  const hayPendientes = data.pendingOrders.length > 0;
  const hayStockBajo = data.lowStockProducts.length > 0;

  return (
    <div className="space-y-4">
      <SalesAnomalyAlert storeSlug={storeSlug} />
      <VendorKPICards kpis={data.kpis} />
      {(hayPendientes || hayStockBajo) && (
        <div className={`grid grid-cols-1 gap-4 ${hayPendientes && hayStockBajo ? "lg:grid-cols-2" : ""}`}>
          {hayPendientes && <VendorPendingOrders orders={data.pendingOrders} />}
          {hayStockBajo && <VendorLowStockList products={data.lowStockProducts} />}
        </div>
      )}
      <VendorWeeklyChart data={data.weeklyRevenue} />
      <VendorRecentSales sales={data.recentSales} />
      <StockoutPredictionWidget storeSlug={storeSlug} />
      <MarketplaceAdvancedCharts />
      <SponsoredAdminPanel storeSlug={storeSlug} />
    </div>
  );
}
