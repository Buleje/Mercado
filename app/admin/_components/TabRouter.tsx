"use client";

import dynamic from "next/dynamic";
import { Users, SlidersHorizontal, ArrowUpDown, RefreshCw, GraduationCap } from "lucide-react";
import { TabSpinner } from "@/app/admin/_lib/tab-spinner";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import type { StoreMode } from "@/lib/jsondb";
import DashboardWidgets from "@/components/admin/shared/DashboardWidgets";
import OnboardingWizard from "@/components/admin/shared/OnboardingWizard";

// ── Lazy tab wrappers (TASK-003 — reusable dynamic shells) ─────────────────────
// These four wrappers live under components/admin/tabs/* and wrap their
// heavier unified/* counterparts with a shared TabSkeleton loader. Routing
// through them keeps the admin route bundle lean and guarantees a single
// chunk split per tab.
const ReportsTab   = dynamic(() => import("@/components/admin/tabs/ReportsTab"),   { loading: TabSpinner });
const InventoryTab = dynamic(() => import("@/components/admin/tabs/InventoryTab"), { loading: TabSpinner });
const SettingsTab  = dynamic(() => import("@/components/admin/tabs/SettingsTab"),  { loading: TabSpinner });
const AuditTab     = dynamic(() => import("@/components/admin/tabs/AuditTab"),     { loading: TabSpinner });

// ── Unified Module Imports (módulos consolidados) ──────────────────────────────
const VendorDashboardModule   = dynamic(() => import("@/components/admin/unified/VendorDashboardModule"),   { loading: TabSpinner });
const AsistenteIAModule       = dynamic(() => import("@/components/admin/unified/AsistenteIAModule"),       { loading: TabSpinner });
// POSCajaModule removido — ventas-caja eliminado del panel
const CatalogoTiendaModule    = dynamic(() => import("@/components/admin/unified/CatalogoTiendaModule"),    { loading: TabSpinner });
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

// ── Módulos adicionales ────────────────────────────────────────────────────────
const DevolucionesProveedorModule = dynamic(() => import("@/components/admin/DevolucionesProveedorModule"), { loading: TabSpinner });
const FiadosModule              = dynamic(() => import("@/components/admin/FiadosModule"),              { loading: TabSpinner });
const TurnosModule              = dynamic(() => import("@/components/admin/TurnosModule"),              { loading: TabSpinner });
const RecetasModule             = dynamic(() => import("@/components/admin/RecetasModule"),             { loading: TabSpinner });
const PrestamosModule           = dynamic(() => import("@/components/admin/PrestamosModule"),           { loading: TabSpinner });
const TreasuryDashboard         = dynamic(() => import("@/components/admin/TreasuryDashboard"),         { loading: TabSpinner });
const PromocionesModule         = dynamic(() => import("@/components/admin/PromocionesModule"),         { loading: TabSpinner });
const ScoringCrediticioTab      = dynamic(() => import("@/components/admin/ScoringCrediticioTab"),      { loading: TabSpinner });
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
}: TabRouterProps) {

  // ── 0. Panel del vendedor ──
  if (tab === "vendor-dashboard") return <VendorDashboardModule />;

  // ── 1. Asistente IA ──
  if (tab === "asistente-ia") return (
    <>
      <OnboardingWizard onNavigate={(t) => onNavigateTab(t as Tab)} />
      <DashboardWidgets onNavigate={(t) => onNavigateTab(t as Tab)} />
      <AsistenteIAModule />
    </>
  );

  // ventas-caja removido — funcionalidad cubierta por Analytics + Pedidos

  // ── 3. Inventario ──
  if (tab === "inventario") return <InventoryTab />;

  // ── 4. Productos & Precios ──
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
  if (tab === "recetas")   return <RecetasModule />;
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
  if (tab === "devoluciones-proveedor") return <DevolucionesProveedorModule />;
  if (tab === "tesoreria")              return <TreasuryDashboard />;
  if (tab === "promociones")            return <PromocionesModule />;
  if (tab === "scoring")                return <ScoringCrediticioTab />;
  // (Declaración Inventario movido dentro del módulo Inventario — tab "Declaración")

  // ── 8. Configuración ──
  // Este tab agrupa varios sub-paneles: Settings, Equipo, Navegación, Reordenar sidebar y Tutorial.
  if (tab === "config") {
    return (
      <div className="space-y-8">
        <SettingsTab storeMode={storeMode} onModeChange={onModeChange} />

        {/* ── Gestión de Equipo ── */}
        <div className="pt-8 border-t border-gray-200 dark:border-card-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Gestión de Equipo</h3>
              <p className="text-xs text-gray-500 dark:text-muted">Gestiona tu equipo y control de acceso por rol</p>
            </div>
          </div>
          <TeamTab />
        </div>

        {/* ── Navegación por defecto ── */}
        <div className="pt-8 border-t border-gray-200 dark:border-card-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Navegacion</h3>
              <p className="text-xs text-gray-500 dark:text-muted">Configura que tab se abre por defecto en cada seccion</p>
            </div>
          </div>
          <NavDefaultTabsConfig />
        </div>

        {/* ── Reordenar barra lateral ── */}
        <div className="pt-8 border-t border-gray-200 dark:border-card-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
              <ArrowUpDown className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Reordenar barra lateral</h3>
              <p className="text-xs text-gray-500 dark:text-muted">Cambia el orden de las secciones en tu menú lateral</p>
            </div>
          </div>
          <SidebarReorderPanel
            categories={visibleCategories}
            onSave={onSaveCategoryOrder}
          />
        </div>

        {/* ── Repetir tutorial ── */}
        <div className="pt-8 border-t border-gray-200 dark:border-card-border">
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                <GraduationCap className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-foreground text-sm">Tutorial de bienvenida</p>
                <p className="text-xs text-gray-500 dark:text-muted">Repasa cómo funciona cada sección del panel</p>
              </div>
            </div>
            <button
              onClick={() => {
                onboarding.resetTour();
                onNavigateTab("asistente-ia");
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#2563EB] hover:bg-primary-dark shadow-sm transition-colors shrink-0"
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

  // ── Rendimiento técnico ──
  if (tab === "rendimiento") return <RendimientoModule />;

  // ── Personalización de tienda, colas y perfil ──
  if (tab === "store-customizer") return <StoreCustomizer />;
  if (tab === "colas")            return <ColasTab />;
  if (tab === "mi-perfil")        return <MiPerfilTab />;

  // ── Página individual de la tienda ──
  if (tab === "pagina-inicio") return <StorePageAdminPage />;

  return null;
}
