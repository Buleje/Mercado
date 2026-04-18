"use client";

import { CardTitle } from "@buleje/design-system";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Users, SlidersHorizontal, ArrowUpDown, RefreshCw, GraduationCap } from "@buleje/design-system/icons";
import { TabSpinner } from "@/app/admin/_lib/tab-spinner";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import type { StoreMode } from "@/lib/jsondb";
import type { AdminMode } from "@/app/admin/_hooks/useAdminMode";
// DashboardWidgets (KPIs) removido — dashboard minimalista

// ── Lazy tab wrappers (TASK-003 — reusable dynamic shells) ─────────────────────
// These four wrappers live under components/admin/tabs/* and wrap their
// heavier unified/* counterparts with a shared TabSkeleton loader. Routing
// through them keeps the admin route bundle lean and guarantees a single
// chunk split per tab.
const ReportsTab   = dynamic(() => import("@/components/admin/tabs/ReportsTab"),   { loading: TabSpinner });
const InventoryTab = dynamic(() => import("@/components/admin/tabs/InventoryTab"), { loading: TabSpinner });
const SettingsTab  = dynamic(() => import("@/components/admin/tabs/SettingsTab"),  { loading: TabSpinner });
const AuditTab     = dynamic(() => import("@/components/admin/tabs/AuditTab"),     { loading: TabSpinner });
const SupportInboxTab = dynamic(
  () => import("@/components/admin/support/UnifiedSupportInbox").then((module) => ({ default: module.UnifiedSupportInbox })),
  { loading: TabSpinner },
);

// ── Unified Module Imports (módulos consolidados) ──────────────────────────────
const VendorDashboardModule   = dynamic(() => import("@/components/admin/unified/VendorDashboardModule"),   { loading: TabSpinner });
const ChatIAModule            = dynamic(() => import("@/components/admin/unified/ChatIAModule"),            { ssr: false, loading: TabSpinner });
const POSCajaModule           = dynamic(() => import("@/components/admin/unified/POSCajaModule"),           { loading: TabSpinner });
const ComprasModule           = dynamic(() => import("@/components/admin/unified/ComprasModule"),           { loading: TabSpinner });
const FinanzasModule          = dynamic(() => import("@/components/admin/unified/FinanzasModule"),          { loading: TabSpinner });
const CRMClientesModule       = dynamic(() => import("@/components/admin/unified/CRMClientesModule"),       { loading: TabSpinner });
const AICommandModule         = dynamic(() => import("@/components/admin/unified/AICommandModule"),         { loading: TabSpinner });
const SugerenciasIAModule     = dynamic(() => import("@/components/admin/unified/SugerenciasIAModule"),     { loading: TabSpinner });
const MetasLogrosModule       = dynamic(() => import("@/components/admin/unified/MetasLogrosModule"),       { loading: TabSpinner });
const MarketplaceModule       = dynamic(() => import("@/components/admin/unified/MarketplaceModule"),       { loading: TabSpinner });
const DeliveryPartnersModule  = dynamic(() => import("@/components/admin/unified/DeliveryPartnersModule"),  { loading: TabSpinner });
const DeliveryLiveTab         = dynamic(() => import("@/components/admin/DeliveryTab"),                     { loading: TabSpinner, ssr: false });
const MarketplaceChatTab      = dynamic(() => import("@/components/admin/ChatTab"),                         { loading: TabSpinner });
const RendimientoModule       = dynamic(() => import("@/components/admin/unified/RendimientoModule"),       { loading: TabSpinner });
const CatalogoTiendaModule    = dynamic(() => import("@/components/admin/unified/CatalogoTiendaModule"),    { loading: TabSpinner });

// ── ENRICH-5 bridges ──────────────────────────────────────────────────────
const SubscriptionsModule      = dynamic(() => import("@/components/admin/unified/SubscriptionsModule"),     { loading: TabSpinner });
const GiftCardsAdminModule     = dynamic(() => import("@/components/admin/unified/GiftCardsAdminModule"),    { loading: TabSpinner });
const SocioMembersAdminModule  = dynamic(() => import("@/components/admin/unified/SocioMembersAdminModule"), { loading: TabSpinner });
const LivesAdminModule         = dynamic(() => import("@/components/admin/unified/LivesAdminModule"),        { loading: TabSpinner });

// ── Módulos adicionales ────────────────────────────────────────────────────────
const FiadosModule              = dynamic(() => import("@/components/admin/FiadosModule"),              { loading: TabSpinner });
const TurnosModule              = dynamic(() => import("@/components/admin/TurnosModule"),              { loading: TabSpinner });
const PrestamosModule           = dynamic(() => import("@/components/admin/PrestamosModule"),           { loading: TabSpinner });
const StoreCustomizer           = dynamic(() => import("@/components/admin/StoreCustomizer"),           { loading: TabSpinner });
const MiPerfilTab               = dynamic(() => import("@/components/admin/MiPerfilTab"),               { loading: TabSpinner });
const ColasTab                  = dynamic(() => import("@/components/admin/ColasTab"),                  { loading: TabSpinner });
const StorePageAdminPage        = dynamic(() => import("@/app/admin/store-page/page"),                  { loading: TabSpinner });
const ForecastingDashboard      = dynamic(() => import("@/components/admin/forecasting/ForecastingDashboard"), { loading: TabSpinner });

// ── Módulos de documentos ──────────────────────────────────────────────────────
const CotizacionesModule   = dynamic(() => import("@/components/admin/CotizacionesModule"),   { loading: TabSpinner });
const GuiasRemisionModule  = dynamic(() => import("@/components/admin/GuiasRemisionModule"),  { loading: TabSpinner });
const NotasCreditoModule   = dynamic(() => import("@/components/admin/NotasCreditoModule"),   { loading: TabSpinner });
const ContratosModule      = dynamic(() => import("@/components/admin/ContratosModule"),      { loading: TabSpinner });

// ── Facturación electrónica SUNAT ──────────────────────────────────────────────
const FacturacionModule    = dynamic(() => import("@/components/admin/unified/FacturacionModule"), { loading: TabSpinner });

// ── Módulos especiales ─────────────────────────────────────────────────────────
const OrdersTab      = dynamic(() => import("@/components/admin/OrdersTab"),      { loading: TabSpinner });
const TeamTab        = dynamic(() => import("@/components/admin/TeamTab"),        { loading: TabSpinner });
const PlanTab        = dynamic(() => import("@/components/admin/PlanTab"),        { loading: TabSpinner });

// ── Componentes de configuración — solo visibles en el tab "config" ──────────
// Se cargan bajo demanda para que no entren en el chunk inicial del admin.
const NavDefaultTabsConfig = dynamic(
  () => import("@/components/admin/NavDefaultTabsConfig").then(m => ({ default: m.NavDefaultTabsConfig })),
  { loading: TabSpinner },
);
const SidebarReorderPanel = dynamic(
  () => import("@/components/admin/SidebarReorderPanel"),
  { loading: TabSpinner },
);

// ── Prefetch map — modulos probables segun el tab activo ─────────────────────
// Cada key es un tab activo, y el value es un array de tabs que probablemente
// el usuario visitara despues. Se precargan tras 2 segundos de inactividad.
const PREFETCH_MAP: Record<string, string[]> = {
  "vendor-dashboard": ["ventas-caja", "inventario"],
  "ventas-caja": ["inventario", "pedidos"],
  "inventario": ["compras", "productos"],
  "clientes": ["fiados", "pedidos"],
  "compras": ["inventario", "productos"],
  "pedidos": ["ventas-caja", "clientes"],
};

// Map de dynamic imports para prefetch — reutiliza los mismos loaders del router
const PREFETCH_LOADERS: Record<string, () => Promise<unknown>> = {
  "vendor-dashboard": () => import("@/components/admin/unified/VendorDashboardModule"),
  "ventas-caja":      () => import("@/components/admin/unified/POSCajaModule"),
  "inventario":       () => import("@/components/admin/tabs/InventoryTab"),
  "productos":        () => import("@/components/admin/unified/CatalogoTiendaModule"),
  "compras":          () => import("@/components/admin/unified/ComprasModule"),
  "clientes":         () => import("@/components/admin/unified/CRMClientesModule"),
  "fiados":           () => import("@/components/admin/FiadosModule"),
  "pedidos":          () => import("@/components/admin/OrdersTab"),
};

/**
 * Hook que prefetches modulos relacionados despues de 2s de inactividad.
 * Solo carga en background, sin afectar el render actual.
 */
function usePrefetchRelated(activeTab: Tab) {
  const prefetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const targets = PREFETCH_MAP[activeTab];
    if (!targets) return;

    const timer = setTimeout(() => {
      for (const tabId of targets) {
        if (prefetchedRef.current.has(tabId)) continue;
        const loader = PREFETCH_LOADERS[tabId];
        if (loader) {
          prefetchedRef.current.add(tabId);
          loader().catch(() => {});
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [activeTab]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Props del TabRouter
// ─────────────────────────────────────────────────────────────────────────────

/** Subconjunto de categorías que necesita el panel "Reordenar barra lateral" */
type CategoryMeta = Pick<TabCategory, "id" | "label">;

export type TabRouterProps = {
  /** Tab actualmente activa */
  tab: Tab;

  // ── Props para el tab "config" ──────────────────────────────────────────────
  /** Modo tienda (whatsapp / proveedor / delivery) — forwarded to SettingsTab wrapper */
  storeMode: StoreMode;
  /** Callback para cambiar el modo tienda — forwarded to SettingsTab wrapper */
  onModeChange: (mode: StoreMode) => void;
  /** Lista de categorías visibles para SidebarReorderPanel */
  visibleCategories: CategoryMeta[];
  /** Callback para guardar el orden de categorías */
  onSaveCategoryOrder: (order: string[]) => void;
  /** Objeto del tour de onboarding para el botón "Repetir tutorial" */
  onboarding: { resetTour: () => void };
  /** Callback para navegar a una tab (lo usa el botón "Repetir tutorial") */
  onNavigateTab: (tab: Tab) => void;
  /** Modo admin fácil/avanzado */
  adminMode?: AdminMode;
  /** Callback para alternar modo admin */
  onToggleAdminMode?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Componente TabRouter
// ─────────────────────────────────────────────────────────────────────────────

export function TabRouter({
  tab,
  storeMode,
  onModeChange,
  visibleCategories,
  onSaveCategoryOrder,
  onboarding,
  onNavigateTab,
  adminMode,
  onToggleAdminMode,
}: TabRouterProps) {

  // Prefetch modulos relacionados tras 2s de inactividad
  usePrefetchRelated(tab);

  // ── 0. Panel del vendedor ──
  if (tab === "vendor-dashboard") return <VendorDashboardModule />;

  // ── 1. Chat IA (standalone) ──
  if (tab === "asistente-ia") return <ChatIAModule />;

  if (tab === "ventas-caja") return <POSCajaModule />;

  // ── 3. Inventario ──
  if (tab === "inventario") return <InventoryTab />;

  // ── 4. Promociones & Ofertas ──
  if (tab === "productos") return <CatalogoTiendaModule />;

  // ── 5. Compras ──
  if (tab === "compras") return <ComprasModule />;

  // ── 6. Mi Plata ──
  if (tab === "plata") return <FinanzasModule />;

  // ── 7. Mis Clientes ──
  if (tab === "clientes") return <CRMClientesModule />;

  // ── Módulos adicionales ──
  if (tab === "fiados")    return <FiadosModule />;
  if (tab === "turnos")    return <TurnosModule />;
  if (tab === "prestamos") return <PrestamosModule />;

  // ── Documentos ──
  if (tab === "cotizaciones")  return <CotizacionesModule />;
  if (tab === "guias-remision") return <GuiasRemisionModule />;
  if (tab === "notas-credito") return <NotasCreditoModule />;
  if (tab === "contratos")     return <ContratosModule />;

  // ── Facturación SUNAT ──
  if (tab === "facturacion") return <FacturacionModule />;

  // ── Módulos nuevos ──
  if (tab === "auditoria")              return <AuditTab />;
  // (Declaración Inventario movido dentro del módulo Inventario — tab "Declaración")

  // ── 8. Configuración ──
  // Este tab agrupa varios sub-paneles: Settings, Equipo, Navegación, Reordenar sidebar y Tutorial.
  if (tab === "config") {
    return (
      <div className="space-y-8">
        <SettingsTab storeMode={storeMode} onModeChange={onModeChange} />

        {/* ── Gestión de Equipo ── */}
        <div className="pt-8 border-t border-[var(--rule-base)] dark:border-card-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface-sunken)]/40 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-[var(--text-tertiary)]" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">Gestión de Equipo</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Gestiona tu equipo y control de acceso por rol</p>
            </div>
          </div>
          <TeamTab />
        </div>

        {/* ── Navegación por defecto ── */}
        <div className="pt-8 border-t border-[var(--rule-base)] dark:border-card-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface-sunken)]/40 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="h-5 w-5 text-[var(--text-tertiary)]" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">Navegación</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Configura que tab se abre por defecto en cada seccion</p>
            </div>
          </div>
          <NavDefaultTabsConfig />
        </div>

        {/* ── Reordenar barra lateral ── */}
        <div className="pt-8 border-t border-[var(--rule-base)] dark:border-card-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface-sunken)]/40 flex items-center justify-center shrink-0">
              <ArrowUpDown className="h-5 w-5 text-[var(--text-tertiary)]" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-[var(--text-primary)] dark:text-foreground">Reordenar barra lateral</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Cambia el orden de las secciones en tu menú lateral</p>
            </div>
          </div>
          <SidebarReorderPanel
            categories={visibleCategories}
            onSave={onSaveCategoryOrder}
          />
        </div>

        {/* ── Repetir tutorial ── */}
        <div className="pt-8 border-t border-[var(--rule-base)] dark:border-card-border">
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5  flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[var(--surface-sunken)]/40 flex items-center justify-center shrink-0">
                <GraduationCap className="h-5 w-5 text-[var(--text-tertiary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">Tutorial de bienvenida</p>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Repasa cómo funciona cada sección del panel</p>
              </div>
            </div>
            <button
              onClick={() => {
                onboarding.resetTour();
                onNavigateTab("asistente-ia");
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-gray-900 dark:bg-white dark:text-[var(--text-primary)] hover:bg-gray-800 dark:hover:bg-gray-100  transition-colors shrink-0"
            >
              <RefreshCw className="h-4 w-4" />
              Repetir tutorial de bienvenida
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Especiales ──
  if (tab === "pedidos") return <OrdersTab />;
  if (tab === "plan")    return <PlanTab />;

  // ── Módulos avanzados ──
  if (tab === "analytics-pro")  return <ReportsTab />;
  if (tab === "forecasting")    return <ForecastingDashboard />;
  if (tab === "ai-command")     return <AICommandModule />;
  if (tab === "sugerencias-ia") return <SugerenciasIAModule />;
  if (tab === "metas-logros")   return <MetasLogrosModule />;

  // ── Marketplace & Delivery ──
  if (tab === "marketplace")       return <MarketplaceModule />;
  if (tab === "delivery-partners") return <DeliveryPartnersModule />;
  if (tab === "delivery-live")     return <DeliveryLiveTab />;
  if (tab === "marketplace-chat")  return <MarketplaceChatTab />;

  // ── ENRICH-5 bridges (marketplace admin surfaces) ──
  if (tab === "subscriptions")     return <SubscriptionsModule />;
  if (tab === "gift-cards-admin")  return <GiftCardsAdminModule />;
  if (tab === "socio-members")     return <SocioMembersAdminModule />;
  if (tab === "lives-admin")       return <LivesAdminModule />;

  // ── Rendimiento técnico ──
  if (tab === "rendimiento") return <RendimientoModule />;

  // ── Personalización de tienda, colas y perfil ──
  if (tab === "store-customizer") return <StoreCustomizer />;
  if (tab === "colas")            return <ColasTab />;
  if (tab === "mi-perfil")        return <MiPerfilTab />;
  if (tab === "support-inbox")    return <SupportInboxTab />;

  // ── Página individual de la tienda ──
  if (tab === "pagina-inicio") return <StorePageAdminPage />;

  return null;
}
