"use client";

import { useState, lazy, Suspense } from "react";
import { Store, Package, ShoppingCart, DollarSign, RefreshCw, TrendingUp, Star, BarChart3, Ticket, Gift, Repeat, HeartHandshake, Radio } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { useMarketplaceKpis } from "@/components/admin/marketplace/hooks/use-marketplace-kpis";
import { Spinner, MODULE_ID } from "@/components/admin/marketplace/shared";
// Sub-tabs (extraídos a marketplace/tabs/, refactor 2026-06-15)
import { MarketplaceFidelidadTab } from "@/components/admin/marketplace/tabs/FidelidadTab";
import { MarketplaceComisionesTab } from "@/components/admin/marketplace/tabs/ComisionesTab";
import { MarketplaceCuponesTab } from "@/components/admin/marketplace/tabs/CuponesTab";
import { MarketplaceResenasTab } from "@/components/admin/marketplace/tabs/ResenasTab";
import { MarketplaceTiendaTab } from "@/components/admin/marketplace/tabs/TiendaTab";
import { MarketplaceProductosTab } from "@/components/admin/marketplace/tabs/ProductosTab";
import { MarketplaceOrdenesTab } from "@/components/admin/marketplace/tabs/OrdenesTab";

// Dynamic import del tab de precios competitivos
const CompetitivePricingTab = lazy(() => import("@/components/admin/CompetitivePricingTab"));
// Dynamic import del dashboard del marketplace (charts unificados)
const MarketplaceDashboardTab = lazy(() => import("@/components/admin/marketplace/MarketplaceDashboard"));

// ── Programas de crecimiento foldeados como sub-tabs (consolidación 4→1) ──
// Antes eran 4 entradas top-level separadas (subscriptions, gift-cards-admin,
// socio-members, lives-admin). Ahora viven como sub-tabs del marketplace.
const SubscriptionsModule     = lazy(() => import("@/components/admin/unified/SubscriptionsModule"));
const GiftCardsAdminModule    = lazy(() => import("@/components/admin/unified/GiftCardsAdminModule"));
const SocioMembersAdminModule = lazy(() => import("@/components/admin/unified/SocioMembersAdminModule"));
const LivesAdminModule        = lazy(() => import("@/components/admin/unified/LivesAdminModule"));

// Spinner · TableSkeleton · SortIcon · KpiTile · MODULE_ID · ORDER_STATUS_CONFIG
// + StoreData/COMMISSION/REVIEW/TIER configs → movidos a marketplace/shared.tsx
// (refactor 2026-06-15). Se importan arriba.

const TABS = [
  { id: "resumen",      label: "Resumen",      icon: BarChart3 },
  { id: "tienda",       label: "Mi Tienda Personal",    icon: Store },
  { id: "productos",    label: "Productos",    icon: Package },
  { id: "ordenes",      label: "Órdenes",      icon: ShoppingCart },
  { id: "comisiones",   label: "Comisiones",   icon: DollarSign },
  { id: "precios",      label: "Precios",      icon: TrendingUp },
  { id: "cupones",      label: "Cupones",      icon: Ticket },
  { id: "resenas",      label: "Reseñas",      icon: Star },
  { id: "fidelidad",    label: "Fidelidad",    icon: Gift },
  // ── Programas de crecimiento (consolidados desde módulos top-level) ──
  { id: "subscriptions", label: "Suscripciones", icon: Repeat },
  { id: "gift-cards",    label: "Gift Cards",    icon: Gift },
  { id: "socio",         label: "Socio Buleje",  icon: HeartHandshake },
  { id: "lives",         label: "Lives",         icon: Radio },
];

type TabId = string;

// CATEGORIAS y ZONAS legacy migrados a <CategoryZonePicker /> (consume catálogo
// del superadmin via /api/marketplace/categories + lib/marketplace-zones).

export default function MarketplaceModule({ initialTab }: { initialTab?: string } = {}) {
  const [tab, setTab] = useState<TabId>(initialTab ?? TABS[0].id);
  const { kpis, loading: kpisLoading, refresh: refreshKpis } = useMarketplaceKpis();

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Crecimiento · Marketplace"
        title="Marketplace"
        description="Gestiona tu tienda en la plataforma de ventas."
        icon={Store}
      >
        <button
          onClick={refreshKpis}
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", kpisLoading && "animate-spin")} />
        </button>
      </AdminModuleHeader>

      {/* KPI strip removido — Brandon decisión 2026-05-09. Los KPIs detallados
          están dentro del sub-tab "Resumen" (MarketplaceDashboardTab). */}

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "resumen"     && (
          <Suspense fallback={<Spinner />}>
            <MarketplaceDashboardTab kpis={kpis} loading={kpisLoading} />
          </Suspense>
        )}
        {tab === "tienda"      && <MarketplaceTiendaTab />}
        {tab === "productos"   && <MarketplaceProductosTab />}
        {tab === "ordenes"     && <MarketplaceOrdenesTab />}
        {tab === "comisiones"  && <MarketplaceComisionesTab />}
        {tab === "precios"     && (
          <Suspense fallback={<Spinner />}>
            <CompetitivePricingTab />
          </Suspense>
        )}
        {tab === "cupones"     && <MarketplaceCuponesTab />}
        {tab === "resenas"     && <MarketplaceResenasTab />}
        {tab === "fidelidad"   && <MarketplaceFidelidadTab />}
        {tab === "subscriptions" && <Suspense fallback={<Spinner />}><SubscriptionsModule /></Suspense>}
        {tab === "gift-cards"    && <Suspense fallback={<Spinner />}><GiftCardsAdminModule /></Suspense>}
        {tab === "socio"         && <Suspense fallback={<Spinner />}><SocioMembersAdminModule /></Suspense>}
        {tab === "lives"         && <Suspense fallback={<Spinner />}><LivesAdminModule /></Suspense>}
      </AdminTabBar>
    </div>
  );
}
