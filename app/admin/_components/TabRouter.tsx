"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { TabSpinner } from "@/app/admin/_lib/tab-spinner";
import { useEnabledSpecs, SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
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
// analytics-pro + forecasting consolidados en AnalisisHubModule (2→1)
const AnalisisHubModule = dynamic(() => import("@/components/admin/unified/AnalisisHubModule"), { loading: TabSpinner });
const InventoryTab = dynamic(() => import("@/components/admin/tabs/InventoryTab"), { loading: TabSpinner });
const SettingsTab  = dynamic(() => import("@/components/admin/tabs/SettingsTab"),  { loading: TabSpinner });
// rendimiento + auditoria + colas consolidados en SistemaHubModule (3→1)
const SistemaHubModule = dynamic(() => import("@/components/admin/unified/SistemaHubModule"), { loading: TabSpinner });
// marketplace-chat + support-inbox consolidados en MensajesHubModule (2→1)
const MensajesHubModule = dynamic(() => import("@/components/admin/unified/MensajesHubModule"), { loading: TabSpinner });

// ── Unified Module Imports (módulos consolidados) ──────────────────────────────
const VendorDashboardModule   = dynamic(() => import("@/components/admin/unified/VendorDashboardModule"),   { loading: TabSpinner });
// Chat IA / Comandos IA / Sugerencias IA consolidados en AsistenteIAHubModule (3→1)
const AsistenteIAHubModule    = dynamic(() => import("@/components/admin/unified/AsistenteIAHubModule"),    { loading: TabSpinner });
const POSCajaModule           = dynamic(() => import("@/components/admin/unified/POSCajaModule"),           { loading: TabSpinner });
const ComprasModule           = dynamic(() => import("@/components/admin/unified/ComprasModule"),           { loading: TabSpinner });
const FinanzasModule          = dynamic(() => import("@/components/admin/unified/FinanzasModule"),          { loading: TabSpinner });
const CRMClientesModule       = dynamic(() => import("@/components/admin/unified/CRMClientesModule"),       { loading: TabSpinner });
// leads-funnel → sub-tab "Leads" de CRMClientesModule (ver dispatch)
const MetasLogrosModule       = dynamic(() => import("@/components/admin/unified/MetasLogrosModule"),       { loading: TabSpinner });
const MarketplaceModule       = dynamic(() => import("@/components/admin/unified/MarketplaceModule"),       { loading: TabSpinner });
const DocumentosHubModule     = dynamic(() => import("@/components/admin/unified/DocumentosHubModule"),    { loading: TabSpinner });
const DeliveryPartnersModule  = dynamic(() => import("@/components/admin/unified/DeliveryPartnersModule"),  { loading: TabSpinner });
// delivery-live consolidado como sub-tab "Pedidos en vivo" de DeliveryPartnersModule (2→1)
// marketplace-chat → sub-tab "chat" de MensajesHubModule (ver dispatch)
// rendimiento → sub-tab de SistemaHubModule (ver dispatch)
const CatalogoTiendaModule    = dynamic(() => import("@/components/admin/unified/CatalogoTiendaModule"),    { loading: TabSpinner });

// ── ENRICH-5 bridges — programas de crecimiento consolidados en MarketplaceModule (4→1) ──
// subscriptions · gift-cards-admin · socio-members · lives-admin son ahora
// sub-tabs del marketplace. Ver dispatch más abajo (<MarketplaceModule initialTab=…>).

// ── Módulos adicionales ────────────────────────────────────────────────────────
const PorCobrarDashboard        = dynamic(() => import("@/components/admin/PorCobrarDashboard"),        { loading: TabSpinner });
// turnos → sub-tab "Turnos" de POSCajaModule (era duplicado top-level)
// Fiados/Préstamos/Adelantos/Activos consolidados como sub-tabs de FinanzasModule
// (ver TabRouter dispatch más abajo — todos renderean <FinanzasModule initialTab=...>).
const RecetasModule             = dynamic(() => import("@/components/admin/RecetasModule"),             { loading: TabSpinner });
// ADR-124 — Especialización forestal CTP
const CTPLibroOperaciones       = dynamic(() => import("@/components/admin/forestal/CTPLibroOperaciones"), { loading: TabSpinner });
// ADR-125 — Especialización forestal Títulos Habilitantes (LO-TH)
const LothLibroOperaciones      = dynamic(() => import("@/components/admin/forestal/LothLibroOperaciones"), { loading: TabSpinner });
// ADR-128 — Especialización agrícola: Acopio & Beneficio de Cacao
const CacaoAcopio               = dynamic(() => import("@/components/admin/cacao/CacaoAcopio"), { loading: TabSpinner });
// scoring → sub-tab "Scoring crediticio" de FinanzasModule (ver dispatch)
// devoluciones-proveedor → sub-tab "Devoluciones" de ComprasModule (era duplicado top-level)
// store-customizer + pagina-inicio consolidados en MiTiendaHubModule (2→1)
const MiTiendaHubModule         = dynamic(() => import("@/components/admin/unified/MiTiendaHubModule"),  { loading: TabSpinner });
const MiPerfilTab               = dynamic(() => import("@/components/admin/MiPerfilTab"),               { loading: TabSpinner });
// colas → sub-tab de SistemaHubModule (ver dispatch)
// forecasting → sub-tab "forecast" de AnalisisHubModule (ver dispatch)

// ── Documentos comerciales & SUNAT consolidados en DocumentosHubModule (6→1) ──
// facturacion · cotizaciones · guias-remision · notas-credito · contratos · documentos
// son ahora sub-tabs del hub (cada uno conserva su módulo y header propios).
// Ver dispatch más abajo — todos renderean <DocumentosHubModule initialTab=…>.

// ── Módulos especiales ─────────────────────────────────────────────────────────
const OrdersTab      = dynamic(() => import("@/components/admin/OrdersTab"),      { loading: TabSpinner });
const PlanTab        = dynamic(() => import("@/components/admin/PlanTab"),        { loading: TabSpinner });

// TeamTab, NavDefaultTabsConfig y SidebarReorderPanel viven ahora dentro
// del SettingsModule (forman parte de la grilla principal del config).

// ── Prefetch map — modulos probables segun el tab activo ─────────────────────
// Cada key es un tab activo, y el value es un array de tabs que probablemente
// el usuario visitara despues. Se precargan tras 2 segundos de inactividad.
// QW3 perf (2026-05-16): map ampliado para cubrir los hubs principales
// y triplets de navegación natural (vendor → POS → inventario → compras).
const PREFETCH_MAP: Record<string, string[]> = {
  "vendor-dashboard": ["ventas-caja", "inventario", "pedidos"],
  "ventas-caja": ["inventario", "pedidos", "clientes"],
  "inventario": ["compras", "productos", "plata"],
  "productos": ["inventario", "promociones", "marketplace"],
  "clientes": ["fiados", "pedidos", "ventas-caja"],
  "compras": ["inventario", "productos", "plata"],
  "pedidos": ["ventas-caja", "clientes", "inventario"],
  "plata": ["ventas-caja", "compras", "fiados"],
  "fiados": ["clientes", "plata", "ventas-caja"],
  "marketplace": ["productos", "vendor-dashboard"],
  "promociones": ["productos", "ventas-caja"],
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
  "plata":            () => import("@/components/admin/unified/FinanzasModule"),
  "marketplace":      () => import("@/components/admin/unified/MarketplaceModule"),
  "promociones":      () => import("@/components/admin/PromocionesModule"),
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

  // ── Guard de especialización (ADR-124, fix 2026-05-29) ──
  // Si el tab activo es spec-gated (cacao, forestal…) y el superadmin la
  // desactivó, NO renderizar el módulo (evita 403 + pantalla rota cuando el
  // último tab persistido en localStorage quedó deshabilitado). Redirige a
  // inicio. Solo cuando specs YA cargaron (sino redirigiría un tab válido en
  // el flash de loading).
  const { enabledModuleIds, isLoading: specsLoading } = useEnabledSpecs();
  const specBlocked = SPEC_GATED_MODULE_IDS.has(tab) && !specsLoading && !enabledModuleIds.has(tab);
  useEffect(() => {
    if (specBlocked) onNavigateTab("inicio" as Tab);
  }, [specBlocked, onNavigateTab]);
  if (specBlocked) return <TabSpinner />;

  // ── 0. Panel del vendedor ──
  if (tab === "vendor-dashboard") return <VendorDashboardModule />;

  // ── 1. Chat IA (standalone) ──
  if (tab === "asistente-ia") return <AsistenteIAHubModule key="asistente-ia" initialTab="chat" />;

  if (tab === "ventas-caja") return <POSCajaModule key="ventas-caja" />;

  // ── 3. Inventario ──
  if (tab === "inventario") return <InventoryTab />;

  // ── 4. Promociones & Ofertas ──
  if (tab === "productos") return <CatalogoTiendaModule />;

  // ── 5. Compras ──
  if (tab === "compras") return <ComprasModule key="compras" />;

  // ── 6. Mi Plata (hub financiero — incluye fiados/préstamos/adelantos/activos) ──
  if (tab === "plata") return <FinanzasModule key="plata" />;

  // ── 7. Mis Clientes ──
  if (tab === "clientes") return <CRMClientesModule key="clientes" />;

  if (tab === "leads-funnel") return <CRMClientesModule key="leads-funnel" initialTab="leads" />;

  // ── Módulos adicionales ──
  if (tab === "fiados")    return <FinanzasModule key="fiados" initialTab="fiados" />;
  if (tab === "por-cobrar") return <PorCobrarDashboard />;
  if (tab === "turnos")    return <POSCajaModule key="turnos" initialTab="turnos" />;
  if (tab === "prestamos") return <FinanzasModule key="prestamos" initialTab="prestamos" />;
  if (tab === "adelantos") return <FinanzasModule key="adelantos" initialTab="adelantos" />;
  if (tab === "activos") return <FinanzasModule key="activos" initialTab="activos" />;
  if (tab === "recetas")   return <RecetasModule />;
  // ADR-124 — Especializaciones por tenant. El endpoint /api/admin/forestal/*
  // protege el acceso (ensureSpecializationOrDeny → 403 si no habilitada).
  // El módulo se renderiza siempre que el tab esté en el sidebar (gating en
  // sidebar pendiente Phase 4 — useEnabledSpecs hook).
  if (tab === "ctp-libro-operaciones") return <CTPLibroOperaciones />;
  if (tab === "loth-libro-operaciones") return <LothLibroOperaciones />;
  if (tab === "cacao-acopio") return <CacaoAcopio />;
  if (tab === "scoring")   return <FinanzasModule key="scoring" initialTab="scoring" />;
  if (tab === "devoluciones-proveedor") return <ComprasModule key="devoluciones-proveedor" initialTab="devoluciones" />;

  // ── Documentos comerciales & SUNAT (hub consolidado — 6 sub-tabs) ──
  if (tab === "cotizaciones")   return <DocumentosHubModule key="cotizaciones" initialTab="cotizaciones" />;
  if (tab === "guias-remision") return <DocumentosHubModule key="guias" initialTab="guias" />;
  if (tab === "notas-credito")  return <DocumentosHubModule key="notas" initialTab="notas" />;
  if (tab === "contratos")      return <DocumentosHubModule key="contratos" initialTab="contratos" />;
  if (tab === "facturacion")    return <DocumentosHubModule key="facturacion" initialTab="facturacion" />;

  // ── Módulos nuevos ──
  if (tab === "auditoria")              return <SistemaHubModule key="auditoria" initialTab="auditoria" />;
  // (Declaración Inventario movido dentro del módulo Inventario — tab "Declaración")

  // ── 8. Configuración ──
  // Equipo, Navegación, Reordenar sidebar y Tutorial son ahora secciones
  // del SettingsModule (forman parte de la grilla principal). Se pasan
  // los callbacks/data via props para que las que requieren contexto
  // (sidebar order categories, tutorial reset) funcionen.
  if (tab === "config") {
    return (
      <SettingsTab
        storeMode={storeMode}
        onModeChange={onModeChange}
        reorderCategories={visibleCategories}
        onSaveSidebarOrder={onSaveCategoryOrder}
        onResetTutorial={() => onboarding.resetTour()}
        onNavigateTab={(t) => onNavigateTab(t as Tab)}
      />
    );
  }

  // ── Especiales ──
  if (tab === "pedidos") return <OrdersTab />;
  if (tab === "plan")    return <PlanTab />;

  // ── Módulos avanzados ──
  if (tab === "analytics-pro")  return <AnalisisHubModule key="analytics-pro" initialTab="analytics" />;
  if (tab === "forecasting")    return <AnalisisHubModule key="forecasting" initialTab="forecast" />;
  if (tab === "ai-command")     return <AsistenteIAHubModule key="ai-command" initialTab="comandos" />;
  if (tab === "sugerencias-ia") return <AsistenteIAHubModule key="sugerencias-ia" initialTab="sugerencias" />;
  if (tab === "metas-logros")   return <MetasLogrosModule />;

  // ── Marketplace & Delivery ──
  if (tab === "marketplace")       return <MarketplaceModule key="marketplace" />;
  if (tab === "delivery-partners") return <DeliveryPartnersModule key="delivery-partners" />;
  if (tab === "delivery-live")     return <DeliveryPartnersModule key="delivery-live" initialTab="pedidos-vivo" />;
  if (tab === "marketplace-chat")  return <MensajesHubModule key="marketplace-chat" initialTab="chat" />;

  // ── ENRICH-5 (programas de crecimiento — sub-tabs del Marketplace) ──
  if (tab === "subscriptions")     return <MarketplaceModule key="subscriptions" initialTab="subscriptions" />;
  if (tab === "gift-cards-admin")  return <MarketplaceModule key="gift-cards" initialTab="gift-cards" />;
  if (tab === "socio-members")     return <MarketplaceModule key="socio" initialTab="socio" />;
  if (tab === "lives-admin")       return <MarketplaceModule key="lives" initialTab="lives" />;

  // ── Rendimiento técnico ──
  if (tab === "rendimiento") return <SistemaHubModule key="rendimiento" initialTab="rendimiento" />;

  // ── Personalización de tienda, colas y perfil ──
  if (tab === "store-customizer") return <MiTiendaHubModule key="store-customizer" initialTab="identidad" />;
  if (tab === "colas")            return <SistemaHubModule key="colas" initialTab="colas" />;
  if (tab === "mi-perfil")        return <MiPerfilTab />;
  if (tab === "support-inbox")    return <MensajesHubModule key="support-inbox" initialTab="soporte" />;

  // ── Página individual de la tienda ──
  if (tab === "pagina-inicio") return <MiTiendaHubModule key="pagina-inicio" initialTab="pagina" />;

  // ── Documentación (drive interno) — sub-tab "drive" del hub de Documentos ──
  if (tab === "documentos") return <DocumentosHubModule key="documentos" initialTab="drive" />;

  return null;
}

