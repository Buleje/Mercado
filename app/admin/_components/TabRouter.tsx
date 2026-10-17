"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { TabSpinner } from "@/app/admin/_lib/tab-spinner";
import { preloadTab } from "@/app/admin/_lib/tab-preload";
import { useEnabledSpecs, SPEC_GATED_MODULE_IDS } from "@/hooks/use-enabled-specs";
import { origenesQueAbren } from "@/lib/admin/permiso-vista";
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
// rendimiento + auditoria + colas + plan → vistas de Configuración (ola 2 del
// panel unificado): sus ids son alias de `config&vista=sistema|plan` y nunca
// llegan acá. SistemaHubModule y PlanTab quedan sin montar desde TabRouter.
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
// ADR-497 — plan de la empresa: ficha, socios, FODA, objetivos, organización y políticas
const PlanificacionModule     = dynamic(() => import("@/components/admin/unified/PlanificacionModule"),     { loading: TabSpinner });
// Crecimiento (Marketing & Fidelización) — Ola 1: Campañas + Puntos consolidados
const CrecimientoHubModule    = dynamic(() => import("@/components/admin/unified/CrecimientoHubModule"),    { loading: TabSpinner });
// Canales (SalesChannelsTab) es Tienda online › Redes y medición, y Tareas y
// Notas son vistas de Equipo (ola 2): EquipoHubModule queda sin montar.
// Equipo (ADR-414): personal, asistencia, lo ganado, contratos, tareas y notas
const RecursosHumanosHubModule = dynamic(() => import("@/components/admin/unified/RecursosHumanosHubModule"), { loading: TabSpinner });
const MarketplaceModule       = dynamic(() => import("@/components/admin/unified/MarketplaceModule"),       { loading: TabSpinner });
const DocumentosHubModule     = dynamic(() => import("@/components/admin/unified/DocumentosHubModule"),    { loading: TabSpinner });
// Comprobantes (ola 3): Facturas y boletas · Notas de crédito · Guías de remisión · Cotizaciones
const ComprobantesHubModule   = dynamic(() => import("@/components/admin/unified/ComprobantesHubModule"),  { loading: TabSpinner });
// delivery-partners + delivery-live → Pedidos y reparto › Reparto (ola 2): OrdersTab monta DeliveryPartnersModule
// marketplace-chat → sub-tab "chat" de MensajesHubModule (ver dispatch)
// rendimiento → Configuración › Sistema › Velocidad (alias, ola 2)
// productos → Productos e inventario › Categorías (ola 3): CatalogoTiendaModule queda sin montar.

// ── ENRICH-5 bridges — programas de crecimiento consolidados en MarketplaceModule (4→1) ──
// subscriptions · gift-cards-admin · socio-members · lives-admin son ahora
// sub-tabs del marketplace. Ver dispatch más abajo (<MarketplaceModule initialTab=…>).

// ── Módulos adicionales ────────────────────────────────────────────────────────
// por-cobrar, préstamos, adelantos, activos y scoring → hojas de Mi Plata (alias, ola 3)
// turnos → vista "Turnos" de POSCajaModule; fiados → Ventas y caja › Me deben (ola 3)
const RecetasModule             = dynamic(() => import("@/components/admin/RecetasModule"),             { loading: TabSpinner });
// dropship → Compras › Dropship (ola 3): ComprasModule monta DropshipModule adentro.
// ADR-124 — Especialización forestal CTP
const CTPLibroOperaciones       = dynamic(() => import("@/components/admin/forestal/CTPLibroOperaciones"), { loading: TabSpinner });
// ADR-136 — Lotes de producción / comercialización forestal
const ForestLotesModule         = dynamic(() => import("@/components/admin/forestal/ForestLotesModule"), { loading: TabSpinner });
// ADR-125 — Especialización forestal Títulos Habilitantes (LO-TH)
const LothLibroOperaciones      = dynamic(() => import("@/components/admin/forestal/LothLibroOperaciones"), { loading: TabSpinner });
const ForestalHerramientas      = dynamic(() => import("@/components/admin/forestal/ForestalHerramientas"), { loading: TabSpinner });
const CamarasModule             = dynamic(() => import("@/components/admin/CamarasModule"), { loading: TabSpinner });
// forestal-tramites → 2.ª fase de ForestalHerramientas (ola 2)
// ADR-128 — Especialización agrícola: Acopio & Beneficio de Cacao
const CacaoAcopio               = dynamic(() => import("@/components/admin/cacao/CacaoAcopio"), { loading: TabSpinner });
// ADR-457 — piezas a medida del negocio (enchufe `panel.pestana`)
const ALaMedidaModule           = dynamic(() => import("@/components/admin/a-medida/ALaMedidaModule"), { loading: TabSpinner });
// scoring → sub-tab "Scoring crediticio" de FinanzasModule (ver dispatch)
// devoluciones-proveedor → sub-tab "Devoluciones" de ComprasModule (era duplicado top-level)
// store-customizer + pagina-inicio consolidados en MiTiendaHubModule (2→1)
const MiTiendaHubModule         = dynamic(() => import("@/components/admin/unified/MiTiendaHubModule"),  { loading: TabSpinner });
const MiPerfilTab               = dynamic(() => import("@/components/admin/MiPerfilTab"),               { loading: TabSpinner });
// colas → Configuración › Sistema › Colas (alias, ola 2)
// forecasting → sub-tab "forecast" de AnalisisHubModule (ver dispatch)

// ── Comprobantes y Documentos (ola 3 del panel unificado) ──
// facturacion · cotizaciones · guias-remision · notas-credito → ComprobantesHubModule;
// documentos · contratos → DocumentosHubModule (Archivo y Contratos).

// ── Módulos especiales ─────────────────────────────────────────────────────────
const OrdersTab      = dynamic(() => import("@/components/admin/OrdersTab"),      { loading: TabSpinner });

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
  // Ola 3: Productos vive en Productos e inventario y los fiados en Ventas y
  // caja › Me deben; `productos`, `promociones` y `fiados` ya no son pestaña activa.
  "inventario": ["compras", "plata"],
  "clientes": ["ventas-caja", "pedidos"],
  "compras": ["inventario", "plata"],
  "pedidos": ["ventas-caja", "clientes", "inventario"],
  "plata": ["ventas-caja", "compras"],
  "facturacion": ["ventas-caja", "pedidos"],
  "marketplace": ["inventario", "vendor-dashboard"],
};

// Los loaders de precarga viven en app/admin/_lib/tab-preload (compartidos con
// el hover del sidebar) — acá solo decidimos QUÉ tabs precargar por adelantado.

/**
 * Hook que prefetches modulos relacionados despues de 2s de inactividad.
 * Solo carga en background, sin afectar el render actual.
 */
function usePrefetchRelated(activeTab: Tab) {
  useEffect(() => {
    const targets = PREFETCH_MAP[activeTab];
    if (!targets) return;
    // preloadTab ya dedupea internamente (idempotente).
    const timer = setTimeout(() => {
      for (const tabId of targets) preloadTab(tabId);
    }, 2000);
    return () => clearTimeout(timer);
  }, [activeTab]);
}

/**
 * Las especializaciones que abren una pestaña: la suya y las del `origen` de
 * sus vistas que el hub reparte (regla R2 del plan «panel unificado»; la misma
 * de la barra, `origenesQueAbren`). Sólo cuentan las que son especialización:
 * el plan, el rol y la plantilla los mira la barra.
 */
function especialidadesDe(tab: string): string[] {
  return [tab, ...origenesQueAbren(tab)].filter((id) => SPEC_GATED_MODULE_IDS.has(id));
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
  adminMode: _adminMode,
  onToggleAdminMode: _onToggleAdminMode,
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
  // Una pestaña que juntó dos especializaciones (Herramientas y trámites) se
  // abre si alguna está encendida: es la misma regla con la que la barra la
  // muestra (el `origen` de sus vistas). Sin esto, un negocio con sólo
  // Trámites veía la pestaña y al tocarla volvía a Inicio.
  const specBlocked =
    SPEC_GATED_MODULE_IDS.has(tab) && !specsLoading && !especialidadesDe(tab).some((id) => enabledModuleIds.has(id));
  useEffect(() => {
    if (specBlocked) onNavigateTab("vendor-dashboard" as Tab);
  }, [specBlocked, onNavigateTab]);
  if (specBlocked) return <TabSpinner />;

  // ── 0. Panel del vendedor ──
  if (tab === "vendor-dashboard") return <VendorDashboardModule />;

  // ── 1. Chat IA (standalone) ──
  if (tab === "asistente-ia") return <AsistenteIAHubModule key="asistente-ia" initialTab="chat" />;

  if (tab === "ventas-caja") return <POSCajaModule key="ventas-caja" />;

  // ── 3. Productos e inventario (ola 3: absorbe Productos y el Conteo físico) ──
  if (tab === "inventario") return <InventoryTab key="inventario" />;
  if (tab === "productos") return <InventoryTab key="productos" initialTab="categorias" />;

  // ── 5. Compras ──
  if (tab === "compras") return <ComprasModule key="compras" />;

  // ── 6. Mi Plata (hub financiero — incluye fiados/préstamos/adelantos/activos) ──
  if (tab === "plata") return <FinanzasModule key="plata" />;

  // ── 7. Mis Clientes ──
  if (tab === "clientes") return <CRMClientesModule key="clientes" />;

  if (tab === "leads-funnel") return <CRMClientesModule key="leads-funnel" initialTab="leads" />;

  // ── Módulos adicionales ──
  // Fiados: casa única en Ventas y caja › Me deben (Brandon, 2026-10-09).
  if (tab === "fiados")    return <POSCajaModule key="fiados" initialTab="cuentas-cobrar" />;
  if (tab === "por-cobrar") return <FinanzasModule key="por-cobrar" initialTab="por-cobrar" />;
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
  if (tab === "forestal-lotes") return <ForestLotesModule />;
  if (tab === "loth-libro-operaciones") return <LothLibroOperaciones />;
  if (tab === "forestal-herramientas") return <ForestalHerramientas key="forestal-herramientas" />;
  if (tab === "forestal-tramites") return <ForestalHerramientas key="forestal-herramientas" initialTab="catalogo" />;
  if (tab === "camaras") return <CamarasModule />;
  if (tab === "cacao-acopio") return <CacaoAcopio />;
  if (tab === "a-medida") return <ALaMedidaModule />;
  if (tab === "scoring")   return <FinanzasModule key="scoring" initialTab="scoring" />;
  if (tab === "devoluciones-proveedor") return <ComprasModule key="devoluciones-proveedor" initialTab="devoluciones" />;
  if (tab === "dropship") return <ComprasModule key="dropship" initialTab="dropship" />;

  // ── Comprobantes (ola 3): sin vista forzada desde la barra, retoma donde quedaste ──
  if (tab === "facturacion")    return <ComprobantesHubModule key="facturacion" />;
  if (tab === "cotizaciones")   return <ComprobantesHubModule key="cotizaciones" initialTab="cotizaciones" />;
  if (tab === "guias-remision") return <ComprobantesHubModule key="guias" initialTab="guias" />;
  if (tab === "notas-credito")  return <ComprobantesHubModule key="notas" initialTab="notas" />;
  if (tab === "contratos")      return <DocumentosHubModule key="contratos" initialTab="contratos" />;

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
  if (tab === "pedidos") return <OrdersTab key="pedidos" />;

  // ── Módulos avanzados ──
  if (tab === "analytics-pro")  return <AnalisisHubModule key="analytics-pro" initialTab="analytics" />;
  if (tab === "forecasting")    return <AnalisisHubModule key="forecasting" initialTab="forecast" />;
  if (tab === "ai-command")     return <AsistenteIAHubModule key="ai-command" initialTab="comandos" />;
  // Sugerencias IA se fundió en Comandos (10-10); el alias de vista no aplica a initialTab.
  if (tab === "sugerencias-ia") return <AsistenteIAHubModule key="sugerencias-ia" initialTab="comandos" />;
  if (tab === "metas-logros")   return <MetasLogrosModule />;
  if (tab === "planificacion")  return <PlanificacionModule />;

  // ── Crecimiento (Marketing & Fidelización) — hub único ──
  // Absorbe campañas/segmentos/puntos/RFM + los 4 programas (gift cards, socio,
  // suscripciones, lives) que antes vivían enterrados como sub-tabs del Marketplace.
  if (tab === "campanas") return <CrecimientoHubModule key="campanas" initialTab="campanas" />;
  if (tab === "puntos")   return <CrecimientoHubModule key="puntos" initialTab="puntos" />;
  if (tab === "canales")  return <MiTiendaHubModule key="pagina-inicio" initialTab="redes" />;

  // ── Equipo (ADR-414; ola 2: suma Tareas y Notas) ──
  if (tab === "rrhh") return <RecursosHumanosHubModule key="rrhh" />;
  if (tab === "tareas") return <RecursosHumanosHubModule key="rrhh" initialTab="tareas" />;
  if (tab === "notas")  return <RecursosHumanosHubModule key="rrhh" initialTab="notas" />;

  // ── Marketplace; Delivery es Pedidos y reparto › Reparto (ola 2) ──
  if (tab === "marketplace")       return <MarketplaceModule key="marketplace" />;
  if (tab === "delivery-partners") return <OrdersTab key="pedidos" initialTab="reparto" />;
  if (tab === "delivery-live")     return <OrdersTab key="pedidos" initialTab="reparto" />;
  if (tab === "marketplace-chat")  return <MensajesHubModule key="marketplace-chat" initialTab="chat" />;
  // Inbox WhatsApp del negocio — entrada directa del sidebar (Brandon 2026-07-16)
  if (tab === "whatsapp-inbox")    return <MensajesHubModule key="whatsapp-inbox" initialTab="whatsapp" />;

  // ── Programas de crecimiento — ahora sub-tabs del hub Crecimiento (movidos
  //    desde Marketplace, 2026-06-21: single home + visible en sidebar) ──
  if (tab === "subscriptions")     return <CrecimientoHubModule key="subscriptions" initialTab="subscriptions" />;
  if (tab === "gift-cards-admin")  return <CrecimientoHubModule key="gift-cards" initialTab="gift-cards" />;
  if (tab === "socio-members")     return <CrecimientoHubModule key="socio" initialTab="socio" />;
  if (tab === "lives-admin")       return <CrecimientoHubModule key="lives" initialTab="lives" />;

  // ── Personalización de tienda y perfil ──
  if (tab === "store-customizer") return <MiTiendaHubModule key="pagina-inicio" initialTab="apariencia" />;
  if (tab === "mi-perfil")        return <MiPerfilTab />;
  if (tab === "support-inbox")    return <MensajesHubModule key="support-inbox" initialTab="soporte" />;

  // ── Tienda online: Apariencia · Contenido · Páginas · Redes y medición ──
  // Sin vista forzada: desde la barra retoma donde quedaste (como Equipo o
  // Pedidos). Antes forzaba «Mi tienda pública» porque ése era el renglón.
  if (tab === "pagina-inicio") return <MiTiendaHubModule key="pagina-inicio" />;

  // ── Documentos: el Archivo (drive interno) y Contratos ──
  if (tab === "documentos") return <DocumentosHubModule key="documentos" initialTab="drive" />;

  return null;
}

