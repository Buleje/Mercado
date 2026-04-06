"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/hooks/use-notifications";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useSwipe } from "@/hooks/use-swipe";
import { useTokenRefresh } from "@/hooks/use-token-refresh";
import { OnboardingTour } from "@/components/admin/OnboardingTour";
import {
  Trash2, Check, X, AlertTriangle,
  Users, Star, LogOut, ShoppingBasket, ShoppingCart,
  Loader2, Truck, FileText, Settings, Menu, Store,
  MapPin, Clock, Phone, ExternalLink, Search,
  Eye, EyeOff, Activity,
  Brain,
  Package, Printer, FlaskConical,
  DollarSign, Layers, Sun, Moon, Download,
  Shield, ChevronDown, ChevronUp,
  CheckCircle, SlidersHorizontal, Sparkles,
  Maximize2, Minimize2, Zap, Tag, RefreshCw, CreditCard, Landmark,
  ClipboardList, Power, RotateCcw,
  Palette, CircleUser, ArrowUpDown, Globe, Pencil, Plus,
} from "lucide-react";
import type { StoreMode } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import { MODULE_PERMISSIONS } from "@/lib/module-permissions";
import { AdminStatsMobile, AdminStatsDesktop } from "@/components/admin/AdminStats";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import { ShortcutsModal, ClearDataModal } from "@/components/admin/AdminModals";
import type { Tab } from "./_lib/tabs.types";
import { TAB_MIGRATION } from "./_lib/tab-migration";
import { TabSpinner } from "./_lib/tab-spinner";
import { NavDefaultTabsConfig } from "@/components/admin/NavDefaultTabsConfig";
import { useKeyboardShortcuts } from "./_hooks/useKeyboardShortcuts";
import { useAdminLayout } from "./_hooks/useAdminLayout";
import { useFavoritesAndRecent } from "./_hooks/useFavoritesAndRecent";
import { useImpersonation } from "./_hooks/useImpersonation";
import { useDemoCleanup } from "./_hooks/useDemoCleanup";
import { useAdminAuth } from "./_hooks/useAdminAuth";
import { useWebhookPendingCount } from "./_hooks/useWebhookPendingCount";
import { useChangelogBadge } from "./_hooks/useChangelogBadge";
import { useHiddenTabs } from "./_hooks/useHiddenTabs";
import { useCategoryOrder } from "./_hooks/useCategoryOrder";
import { useOnboardingTrigger } from "./_hooks/useOnboardingTrigger";
import { useAdminAlerts } from "./_hooks/useAdminAlerts";
import { useNewOrderNotification } from "./_hooks/useNewOrderNotification";
import { useNotificationPermissionPrompt } from "./_hooks/useNotificationPermissionPrompt";
import { useMobileTableCards } from "./_hooks/useMobileTableCards";
import { useOnboardingTourTrigger } from "./_hooks/useOnboardingTourTrigger";

// Lazy-load heavy admin tabs for better initial load performance
// ── Unified Module Imports (8 consolidated modules) ──
const AsistenteIAModule = dynamic(() => import("@/components/admin/unified/AsistenteIAModule"), { loading: TabSpinner });
const POSCajaModule = dynamic(() => import("@/components/admin/unified/POSCajaModule"), { loading: TabSpinner });
const InventarioAlmacenesModule = dynamic(() => import("@/components/admin/unified/InventarioAlmacenesModule"), { loading: TabSpinner });
const CatalogoTiendaModule = dynamic(() => import("@/components/admin/unified/CatalogoTiendaModule"), { loading: TabSpinner });
const ComprasModule = dynamic(() => import("@/components/admin/unified/ComprasModule"), { loading: TabSpinner });
const FinanzasModule = dynamic(() => import("@/components/admin/unified/FinanzasModule"), { loading: TabSpinner });
const CRMClientesModule = dynamic(() => import("@/components/admin/unified/CRMClientesModule"), { loading: TabSpinner });
const AnalyticsProModule = dynamic(() => import("@/components/admin/unified/AnalyticsProModule"), { loading: TabSpinner });
const AICommandModule = dynamic(() => import("@/components/admin/unified/AICommandModule"), { loading: TabSpinner });
const SugerenciasIAModule = dynamic(() => import("@/components/admin/unified/SugerenciasIAModule"), { loading: TabSpinner });
const MetasLogrosModule = dynamic(() => import("@/components/admin/unified/MetasLogrosModule"), { loading: TabSpinner });
const MarketplaceModule = dynamic(() => import("@/components/admin/unified/MarketplaceModule"), { loading: TabSpinner });
const DeliveryPartnersModule = dynamic(() => import("@/components/admin/unified/DeliveryPartnersModule"), { loading: TabSpinner });
const RendimientoModule = dynamic(() => import("@/components/admin/unified/RendimientoModule"), { loading: TabSpinner });

// ── Módulos adicionales ──
const AuditTrailModule = dynamic(() => import("@/components/admin/AuditTrailModule"), { loading: TabSpinner });
const DevolucionesProveedorModule = dynamic(() => import("@/components/admin/DevolucionesProveedorModule"), { loading: TabSpinner });
const FiadosModule = dynamic(() => import("@/components/admin/FiadosModule"), { loading: TabSpinner });
const TurnosModule = dynamic(() => import("@/components/admin/TurnosModule"), { loading: TabSpinner });
const RecetasModule = dynamic(() => import("@/components/admin/RecetasModule"), { loading: TabSpinner });
const PrestamosModule = dynamic(() => import("@/components/admin/PrestamosModule"), { loading: TabSpinner });
const TreasuryDashboard = dynamic(() => import("@/components/admin/TreasuryDashboard"), { loading: TabSpinner });
const PromocionesModule = dynamic(() => import("@/components/admin/PromocionesModule"), { loading: TabSpinner });
const ScoringCrediticioTab = dynamic(() => import("@/components/admin/ScoringCrediticioTab"), { loading: TabSpinner });
const StoreCustomizer     = dynamic(() => import("@/components/admin/StoreCustomizer"),     { loading: TabSpinner });
const MiPerfilTab         = dynamic(() => import("@/components/admin/MiPerfilTab"),         { loading: TabSpinner });
const ColasTab            = dynamic(() => import("@/components/admin/ColasTab"),            { loading: TabSpinner });

// ── Módulos de documentos ──
const CotizacionesModule = dynamic(() => import("@/components/admin/CotizacionesModule"), { loading: TabSpinner });
const GuiasRemisionModule = dynamic(() => import("@/components/admin/GuiasRemisionModule"), { loading: TabSpinner });
const NotasCreditoModule = dynamic(() => import("@/components/admin/NotasCreditoModule"), { loading: TabSpinner });
const ContratosModule = dynamic(() => import("@/components/admin/ContratosModule"), { loading: TabSpinner });
// DeclaracionInventarioModule movido dentro del módulo Inventario (tab "Declaración")

import SSEListener from "@/components/admin/SSEListener";
import NotificationBell from "@/components/notifications/NotificationBell";
import AdminCommandPalette from "@/components/admin/shared/AdminCommandPalette";
import AdminUserDropdown from "@/components/admin/AdminUserDropdown";
import SidebarReorderPanel from "@/components/admin/SidebarReorderPanel";

// Changelog + Export
const ChangelogModal = dynamic(() => import("@/components/admin/ChangelogModal"), { ssr: false });

const TeamTab        = dynamic(() => import("@/components/admin/TeamTab"),        { loading: TabSpinner });
const PlanTab        = dynamic(() => import("@/components/admin/PlanTab"),        { loading: TabSpinner });
const SettingsModule = dynamic(() => import("@/components/admin/SettingsModule"), { loading: TabSpinner });

// Utility components (not tab modules)
const GlobalSearch = dynamic(() => import("@/components/admin/GlobalSearch"), { ssr: false });
const CierreDiarioModal = dynamic(() => import("@/components/cierre-diario/CierreDiarioModal"), { ssr: false });
const MorningSummaryModal = dynamic(() => import("@/components/admin/MorningSummaryModal"), { ssr: false });
const OnboardingWizard = dynamic(() => import("@/components/admin/OnboardingWizard"), { ssr: false });
const ResumenGlobal = dynamic(() => import("@/components/admin/ResumenGlobal"), { ssr: false });

// Modules that ship with auto-seeded demo data and their API cleanup endpoint
const DEMO_DATA_MODULES: Partial<Record<Tab, { label: string; api?: string }>> = {
  "inventario": { label: "24 productos de ejemplo cargados al inicio", api: "/api/admin/demo-products" },
};

// Rich metadata for every module: emoji, priority, description and a helpful tip
const MODULE_INFO: Partial<Record<Tab, { emoji: string; priority: "core" | "high" | "medium" | "low"; desc: string; tip: string }>> = {
  "asistente-ia":  { emoji: "🧠", priority: "core",   desc: "Dashboard IA, chat con asistente y centro de alertas del negocio.",     tip: "Empieza aquí cada mañana para tener el pulso del negocio." },
  "ventas-caja":   { emoji: "🖥️", priority: "core",   desc: "Punto de venta, caja registradora, arqueo, pedidos y cuentas por cobrar.", tip: "Todo lo que necesitas para operar el mostrador en un solo lugar." },
  "inventario":    { emoji: "📦", priority: "core",   desc: "Stock, Kardex, vencimientos, mermas y alertas de inventario.",           tip: "Control completo del inventario desde una sola vista." },
  "productos":     { emoji: "🏪", priority: "high",   desc: "Catálogo, categorías, ofertas, cupones e historial de precios.",         tip: "Gestiona tu catálogo y optimiza precios." },
  "compras":       { emoji: "📋", priority: "high",   desc: "Pedidos a proveedor, directorio de proveedores y recepción.",            tip: "Flujo completo de compras desde la cotización hasta la recepción." },
  "plata":         { emoji: "💵", priority: "high",   desc: "Ingresos, egresos, gastos, ganancias, reportes y exportación.",          tip: "Visión financiera completa del negocio en un solo módulo." },
  "clientes":      { emoji: "👥", priority: "high",   desc: "CRM, delivery, opiniones y programa de fidelización.",                   tip: "Conoce a tus clientes y personaliza la atención." },
  "config":        { emoji: "⚙️", priority: "core",   desc: "Usuarios, permisos, plan y configuración de la página web.",             tip: "Configura esto primero para que todo funcione correctamente." },
  "pedidos":       { emoji: "🛒", priority: "core",   desc: "Gestiona pedidos recibidos, su estado, asignación y entrega.",           tip: "Centraliza pedidos de WhatsApp, tienda online y mostrador." },
  "plan":          { emoji: "⚡", priority: "medium", desc: "Tu plan actual, límites y opciones de mejora.",                          tip: "Revisa tu plan para aprovechar al máximo la plataforma." },
  "fiados":        { emoji: "💰", priority: "high",   desc: "Control de créditos informales: registro, pagos y saldos pendientes.",  tip: "Lleva la cuenta de lo que te deben tus clientes de confianza." },
  "turnos":        { emoji: "⏱️", priority: "high",   desc: "Apertura y cierre de turnos con conteo de efectivo.",                   tip: "Control de caja por turno para saber exactamente cuánto entró." },
  "recetas":       { emoji: "🍳", priority: "medium", desc: "Recetas de producción con ingredientes y control de lotes.",            tip: "Calcula costos de producción y descuenta stock automáticamente." },
  "prestamos":     { emoji: "🏦", priority: "medium", desc: "Préstamos a clientes con cuotas, interés y tabla de amortización.",     tip: "Gestiona préstamos con calculadora integrada y seguimiento de pagos." },
};

type TabCategory = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tabs: Tab[];
};

// ── 7 módulos básicos + config ──────────────────────────────────────────────
const BASIC_MODULES: TabCategory[] = [
  {
    id: "asistente-ia",
    label: "IA & Analítica",
    icon: Brain,
    tabs: ["asistente-ia", "analytics-pro"],
  },
  {
    id: "ventas-caja",
    label: "Ventas & Caja",
    icon: ShoppingCart,
    tabs: ["ventas-caja", "pedidos"],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Package,
    tabs: ["inventario"],
  },
  {
    id: "productos",
    label: "Productos & Precios",
    icon: Tag,
    tabs: ["productos"],
  },
  {
    id: "compras-mod",
    label: "Compras",
    icon: Truck,
    tabs: ["compras"],
  },
  {
    id: "plata",
    label: "Mi Plata",
    icon: DollarSign,
    tabs: ["plata"],
  },
  {
    id: "clientes",
    label: "Mis Clientes",
    icon: Users,
    tabs: ["clientes"],
  },
  {
    id: "fiados",
    label: "Fíados",
    icon: CreditCard,
    tabs: ["fiados"],
  },
  {
    id: "turnos",
    label: "Turnos",
    icon: Clock,
    tabs: ["turnos"],
  },
  {
    id: "recetas",
    label: "Recetas",
    icon: FlaskConical,
    tabs: ["recetas"],
  },
  {
    id: "prestamos",
    label: "Préstamos",
    icon: Landmark,
    tabs: ["prestamos"],
  },
  {
    id: "auditoria",
    label: "Auditoría",
    icon: Shield,
    tabs: ["auditoria"],
  },
  {
    id: "devoluciones-proveedor",
    label: "Devoluciones",
    icon: RotateCcw,
    tabs: ["devoluciones-proveedor"],
  },
  {
    id: "tesoreria",
    label: "Tesorería",
    icon: Landmark,
    tabs: ["tesoreria"],
  },
  {
    id: "promociones",
    label: "Promociones",
    icon: Tag,
    tabs: ["promociones"],
  },
  {
    id: "scoring",
    label: "Scoring Crédito",
    icon: Shield,
    tabs: ["scoring"],
  },
  {
    id: "documentos",
    label: "Documentos",
    icon: FileText,
    tabs: ["cotizaciones", "guias-remision", "notas-credito", "contratos"],
  },
  {
    id: "marketplace-ops",
    label: "Marketplace",
    icon: Store,
    tabs: ["marketplace", "delivery-partners"],
  },
];

// ── Módulo Mi Tienda (personalización visual) ─────────────────────────────────
const TIENDA_MODULE: TabCategory = {
  id: "mi-tienda",
  label: "Mi Tienda",
  icon: Palette,
  tabs: ["store-customizer"],
};

// ── Módulo Config (siempre visible) ──────────────────────────────────────────
const CONFIG_MODULE: TabCategory = {
  id: "config",
  label: "Configuración",
  icon: Settings,
  tabs: ["config", "plan"],
};

// No PRO modules — all modules available to all plans

// ── TAB_CATEGORIES: todos los módulos (Config y Plan accesibles desde dropdown de usuario) ──
const TAB_CATEGORIES: TabCategory[] = [
  ...BASIC_MODULES,
  TIENDA_MODULE,
];

// ── OrdersTab extraído a components/admin/OrdersTab/ ────────────────────────
const OrdersTab = dynamic(() => import("@/components/admin/OrdersTab"), { loading: TabSpinner });

// ── SettingsTab extracted to components/admin/SettingsModule.tsx ──
// ── NavDefaultTabsConfig extraído a components/admin/NavDefaultTabsConfig.tsx ──

function AdminPage() {
  const router = useRouter();

  // Detect tenant prefix from URL (e.g. /t/luis/admin → "/t/luis")
  // so client-side navigations preserve the tenant slug
  const tenantPrefix = useMemo(() => {
    if (typeof window === "undefined") return "";
    const match = window.location.pathname.match(/^(\/t\/[^/]+)\/admin/);
    return match ? match[1] : "";
  }, []);
  const adminPath = (path: string) => `${tenantPrefix}${path}`;

  const VALID_TABS: Tab[] = ["asistente-ia","ventas-caja","inventario","productos","compras","plata","clientes","config","pedidos","plan","analytics-pro","ai-command","fiados","turnos","cotizaciones","guias-remision","notas-credito","contratos","sugerencias-ia","metas-logros","marketplace","delivery-partners","store-customizer","colas"];
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "asistente-ia";
    // 0. Check URL search param first (e.g. /admin?tab=inventario)
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab) {
      const migrated = TAB_MIGRATION[urlTab];
      if (migrated) return migrated;
      if (VALID_TABS.includes(urlTab as Tab)) return urlTab as Tab;
    }
    // 1. Check URL hash (e.g. /admin#inventario)
    const hash = window.location.hash.slice(1); // remove #
    if (hash) {
      const migrated = TAB_MIGRATION[hash];
      if (migrated) return migrated;
      if (VALID_TABS.includes(hash as Tab)) return hash as Tab;
    }
    // 2. Fallback to localStorage
    try {
      const saved = localStorage.getItem("admin_active_tab");
      if (saved) {
        const migrated = TAB_MIGRATION[saved];
        if (migrated) return migrated;
        if (VALID_TABS.includes(saved as Tab)) return saved as Tab;
      }
    } catch {}
    return "asistente-ia";
  });
  const onboarding = useOnboarding();
  // Silent token refresh — rotates access token every 12 min (expires at 15 min)
  useTokenRefresh();
  // storeMode → useAdminAuth (compartido con el resto del flujo de auth)
  // Layout state (mobileNavOpen, compactMode, focusMode, presentationMode)
  // extraído a useAdminLayout — ver app/admin/_hooks/useAdminLayout.ts
  const {
    mobileNavOpen, setMobileNavOpen,
    compactMode, toggleCompact,
    focusMode, toggleFocusMode,
    presentationMode, setPresentationMode,
  } = useAdminLayout();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // null = "Todas"
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showModuleHelp, setShowModuleHelp] = useState(false);
  // favoriteTabs/recentTabs/toggleFavorite/addRecent → useFavoritesAndRecent
  const { favoriteTabs, toggleFavorite, recentTabs, addRecent } = useFavoritesAndRecent();
  const [recentCollapsed, setRecentCollapsed] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmStep, setClearConfirmStep] = useState<1 | 2 | 3>(1);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearingData, setClearingData] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [clearCategories, setClearCategories] = useState<Set<string>>(() => new Set([
    "products", "customers", "orders", "sales", "suppliers", "promotions",
    "cash", "reviews", "expenses", "returns", "activity", "cms", "notifications",
  ]));
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [openAccordionCategories, setOpenAccordionCategories] = useState<Set<string>>(new Set());
  const [sidebarFlyout, setSidebarFlyout] = useState<{ categoryId: string; top: number } | null>(null);
  const flyoutTimerRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  // hiddenTabs/toggleHideTab → useHiddenTabs
  const { hiddenTabs, toggleHideTab } = useHiddenTabs();
  // clearedDemoTabs/demoClearing/dismissDemoTab/clearDemoData → useDemoCleanup
  const { clearedDemoTabs, demoClearing, dismissDemoTab, clearDemoData } = useDemoCleanup(DEMO_DATA_MODULES);
  const [showModuleManager, setShowModuleManager] = useState(false);
  // categoryOrder/saveCategoryOrder → useCategoryOrder
  const { categoryOrder, saveCategoryOrder } = useCategoryOrder();
  const [showCierreDiario, setShowCierreDiario] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  // showOnboarding → useOnboardingTrigger
  const { showOnboarding, setShowOnboarding } = useOnboardingTrigger();
  // changelogHasNew → useChangelogBadge
  const changelogHasNew = useChangelogBadge();

  // ── Open module manager from Settings via custom event ──────────────────
  useEffect(() => {
    const handler = () => setShowModuleManager(true);
    window.addEventListener("open-module-manager", handler);
    return () => window.removeEventListener("open-module-manager", handler);
  }, []);

  // userRole/userName/authReady/savedRolePerms/storeMode → useAdminAuth
  const onUnauth = useCallback(() => {
    router.push(adminPath("/admin/login"));
  // adminPath depende solo de tenantPrefix que es estable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);
  const {
    userRole, userName, authReady, savedRolePerms,
    storeMode, setStoreModeState,
  } = useAdminAuth(onUnauth);

  // SuperAdmin impersonation + tenant info → useImpersonation
  const {
    isSuperAdminImpersonating,
    activeTenantName,
    activeTenantSlug,
    activeTenantType,
    activeTenantLogo,
    handleExit: handleExitImpersonation,
  } = useImpersonation();

  // useScrollLock + handlers Escape/Resize → ahora viven en useAdminLayout
  const { toggle: toggleTheme } = useTheme();
  const { permission, requestPermission, sendNotification, hasAsked } = useNotifications();

  // Auth + settings inicial → useAdminAuth (arriba)
  // webhookPendingCount → useWebhookPendingCount
  const webhookPendingCount = useWebhookPendingCount(userRole);

  // toggleFavorite ahora vive en useFavoritesAndRecent
  // navigateTab compone setTab + URL update + addRecent (de useFavoritesAndRecent)
  const navigateTab = useCallback((id: Tab) => {
    setTab(id);
    setShowModuleHelp(false);
    try { localStorage.setItem("admin_active_tab", id); } catch {}
    // Persist active tab in URL hash + search param so deep-linking and reloading works
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      url.hash = id;
      window.history.replaceState(null, "", url.toString());
    } catch {}
    addRecent(id);
  }, [addRecent]);

  // ── Navigate from notification hub alerts ──
  useEffect(() => {
    const handler = (e: Event) => {
      const { moduleId, tabId } = (e as CustomEvent).detail || {};
      if (moduleId) {
        navigateTab(tabId || moduleId);
      }
    };
    window.addEventListener("admin:navigate", handler);
    return () => window.removeEventListener("admin:navigate", handler);
  }, [navigateTab]);

  // ── Mejora 13: Scroll to top al cambiar módulo ──
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [tab]);

  // ── Mejora 20: Título dinámico del navegador ──
  useEffect(() => {
    const labels: Record<string, string> = {
      "ventas-caja": "POS",
      "inventario": "Inventario",
      "productos": "Productos",
      "compras": "Compras",
      "plata": "Finanzas",
      "clientes": "CRM",
      "fiados": "Fiados",
      "turnos": "Turnos",
      "recetas": "Recetas",
      "prestamos": "Préstamos",
      "pedidos": "Pedidos",
      "analytics-pro": "Analytics",
      "config": "Configuración",
      "asistente-ia": "Asistente IA",
      "cotizaciones": "Cotizaciones",
      "guias-remision": "Guías Remisión",
      "notas-credito": "Notas Crédito",
      "contratos": "Contratos",
      "plan": "Plan",
    };
    document.title = `${labels[tab] || "Panel"} — ${activeTenantName || "Mi Bodega"}`;
  }, [tab]);

  // ── Mejora 16: Swipe para navegar tabs en mobile ──
  const swipeHandlers = useSwipe(
    useCallback(() => {
      // Swipe left → siguiente tab
      const allIds = TAB_CATEGORIES.flatMap(c => c.tabs);
      const idx = allIds.indexOf(tab);
      if (idx >= 0 && idx < allIds.length - 1) navigateTab(allIds[idx + 1]);
    }, [tab, navigateTab]),
    useCallback(() => {
      // Swipe right → tab anterior
      const allIds = TAB_CATEGORIES.flatMap(c => c.tabs);
      const idx = allIds.indexOf(tab);
      if (idx > 0) navigateTab(allIds[idx - 1]);
    }, [tab, navigateTab])
  );

  // toggleCompact y toggleFocusMode → ahora viven en useAdminLayout

  // ── Auto-start onboarding tour → useOnboardingTourTrigger
  useOnboardingTourTrigger(onboarding);

  // ── Fuzzy sidebar search helper ────────────────────────────────────
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const fuzzyMatch = useCallback((text: string, query: string) => {
    const nt = normalize(text);
    const nq = normalize(query);
    // Simple subsequence match
    let qi = 0;
    for (let i = 0; i < nt.length && qi < nq.length; i++) {
      if (nt[i] === nq[qi]) qi++;
    }
    return qi === nq.length;
  }, []);

  // alerts + quickStats + fetchAlerts (polling + SSE) → useAdminAlerts
  const { alerts, quickStats, fetchAlerts } = useAdminAlerts(authReady);

  // Push notification cuando aumentan los pedidos pendientes → useNewOrderNotification
  useNewOrderNotification(quickStats, permission, sendNotification);

  // Pedir permiso de notificaciones al cargar → useNotificationPermissionPrompt
  useNotificationPermissionPrompt(authReady, hasAsked, permission, requestPermission);

  // Convertir tablas a tarjetas en mobile → useMobileTableCards
  useMobileTableCards(authReady, tab);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push(adminPath("/admin/login"));
  };

  // Keyboard shortcuts → useKeyboardShortcuts (DEBE ir después de navigateTab y handleLogout)
  useKeyboardShortcuts({
    navigateTab,
    toggleTheme,
    handleLogout,
    setSearchOpen,
    setShowShortcuts,
    setShowCierreDiario,
    setPresentationMode,
  });

  // ── 8 módulos consolidados + especiales ──────────────────────────────────────
  const ALL_TABS = [
    { id: "asistente-ia" as Tab,   label: "Asistente IA",           icon: Brain },
    { id: "ventas-caja" as Tab,    label: "Ventas & Caja",          icon: ShoppingCart },
    { id: "inventario" as Tab,     label: "Inventario",             icon: Package },
    { id: "productos" as Tab,      label: "Productos & Precios",    icon: Tag },
    { id: "compras" as Tab,        label: "Compras",                icon: Truck },
    { id: "plata" as Tab,          label: "Mi Plata",               icon: DollarSign },
    { id: "clientes" as Tab,       label: "Mis Clientes",           icon: Users },
    // — OPERACIONES —
    { id: "config" as Tab,         label: "Configuración",          icon: Settings },
    { id: "pedidos" as Tab,        label: "Pedidos",                icon: ShoppingBasket },
    // — INTELIGENCIA —
    { id: "analytics-pro" as Tab,  label: "Analytics Pro",          icon: Activity },
    // — FINANZAS EXTRA —
    { id: "prestamos" as Tab,      label: "Préstamos",              icon: Landmark },
    { id: "plan" as Tab,           label: "Plan & Límites",         icon: Zap },
    // — PRODUCCIÓN —
    { id: "recetas" as Tab,        label: "Recetas",                icon: FlaskConical },
    // — DOCUMENTOS COMERCIALES —
    { id: "cotizaciones" as Tab,          label: "Cotizaciones",           icon: ClipboardList },
    { id: "guias-remision" as Tab,        label: "Guías de Remisión",      icon: Truck },
    { id: "notas-credito" as Tab,         label: "Notas de Crédito",       icon: FileText },
    { id: "contratos" as Tab,             label: "Contratos",              icon: FileText },
    // — Declaración Inventario ahora está dentro de Inventario (tab "Declaración") —
    // — MARKETPLACE & DELIVERY —
    { id: "marketplace" as Tab,        label: "Marketplace",          icon: Store },
    { id: "delivery-partners" as Tab,  label: "Delivery Partners",    icon: Truck },
    // — MI TIENDA —
    { id: "store-customizer" as Tab,   label: "Mi Tienda",            icon: Palette },
    // — SISTEMA —
    { id: "colas" as Tab,              label: "Colas",                icon: Activity },
    { id: "mi-perfil" as Tab,          label: "Mi Perfil",            icon: CircleUser },
  ] as const;

  // All modules available — sorted by user's custom category order
  const visibleCategories: TabCategory[] = useMemo(() => {
    if (categoryOrder.length === 0) return TAB_CATEGORIES;
    const ordered: TabCategory[] = [];
    for (const id of categoryOrder) {
      const cat = TAB_CATEGORIES.find(c => c.id === id);
      if (cat) ordered.push(cat);
    }
    // Append any new categories not yet in the saved order
    for (const cat of TAB_CATEGORIES) {
      if (!categoryOrder.includes(cat.id)) ordered.push(cat);
    }
    return ordered;
  }, [categoryOrder]);

  // Role-based tab filtering — populated from lib/module-permissions.ts
  const DEFAULT_ROLE_TABS: Record<string, Tab[]> = {
    admin: ALL_TABS.map(t => t.id),
    cajero: MODULE_PERMISSIONS.cajero as Tab[],
    almacenero: MODULE_PERMISSIONS.almacenero as Tab[],
  };
  const ROLE_TABS: Record<string, Tab[]> = {
    ...DEFAULT_ROLE_TABS,
    ...(savedRolePerms ? Object.fromEntries(
      Object.entries(savedRolePerms).map(([role, tabs]) => [role, tabs as Tab[]])
    ) : {}),
    admin: ALL_TABS.map(t => t.id),
  };
  const allowedTabs = ROLE_TABS[userRole] ?? ROLE_TABS.admin;
  let filteredTabs = ALL_TABS.filter(t => allowedTabs.includes(t.id) && !hiddenTabs.has(t.id));
  
  // Category filtering — usa visibleCategories para respetar plan gating
  if (selectedCategory) {
    const categoryTabs = visibleCategories.find(c => c.id === selectedCategory)?.tabs ?? [];
    filteredTabs = filteredTabs.filter(t => categoryTabs.includes(t.id));
  }

  // Sidebar fuzzy search
  if (sidebarSearch.trim()) {
    filteredTabs = filteredTabs.filter(t => fuzzyMatch(t.label, sidebarSearch.trim()));
  }

  // Favorite & recent subsets for sidebar sections
  const favoriteTabItems = ALL_TABS.filter(t => favoriteTabs.has(t.id) && allowedTabs.includes(t.id));

  // Custom shortcuts from SettingsModule
  const [customShortcutsVersion, setCustomShortcutsVersion] = useState(0);
  useEffect(() => {
    const handler = () => setCustomShortcutsVersion(v => v + 1);
    window.addEventListener("storage", handler);
    // Also listen for custom event from same tab
    window.addEventListener("admin-shortcuts-changed", handler);
    return () => { window.removeEventListener("storage", handler); window.removeEventListener("admin-shortcuts-changed", handler); };
  }, []);
  const customShortcutItems = useMemo(() => {
    try {
      const saved = localStorage.getItem("admin_custom_shortcuts");
      if (!saved) return [];
      const shortcuts: Array<{ id: string; label: string; tabId: string }> = JSON.parse(saved);
      return shortcuts
        .filter(s => ALL_TABS.some(t => t.id === s.tabId))
        .map(s => {
          const match = ALL_TABS.find(t => t.id === s.tabId);
          return match ? { id: s.tabId as Tab, label: s.label, icon: match.icon } : null;
        })
        .filter(Boolean) as Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }>;
    } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customShortcutsVersion]);

  const recentTabItems = recentTabs
    .filter(id => id !== tab && !favoriteTabs.has(id) && allowedTabs.includes(id))
    .map(id => ALL_TABS.find(t => t.id === id)!)
    .filter(Boolean)
    .slice(0, 5);

  // ── Editable sidebar shortcuts ──────────────────────────────────────────────
  const DEFAULT_SHORTCUTS: Array<{ id: string; label: string }> = [
    { id: "asistente-ia", label: "Dashboard" },
    { id: "inventario", label: "Stock" },
    { id: "pedidos", label: "Pedidos" },
    { id: "ventas-caja", label: "Caja POS" },
  ];
  const [sidebarShortcuts, setSidebarShortcuts] = useState<Array<{ id: string; label: string }>>(() => {
    try {
      const saved = localStorage.getItem("admin_sidebar_shortcuts");
      if (saved) {
        const parsed = JSON.parse(saved) as Array<{ id: string; label: string }>;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* use default */ }
    return DEFAULT_SHORTCUTS;
  });
  const [editingShortcuts, setEditingShortcuts] = useState(false);
  const [showAddShortcut, setShowAddShortcut] = useState(false);

  const saveSidebarShortcuts = useCallback((next: Array<{ id: string; label: string }>) => {
    setSidebarShortcuts(next);
    localStorage.setItem("admin_sidebar_shortcuts", JSON.stringify(next));
  }, []);

  const removeShortcut = useCallback((id: string) => {
    saveSidebarShortcuts(sidebarShortcuts.filter(s => s.id !== id));
  }, [sidebarShortcuts, saveSidebarShortcuts]);

  const addShortcut = useCallback((tabId: string) => {
    const match = ALL_TABS.find(t => t.id === tabId);
    if (match && !sidebarShortcuts.some(s => s.id === tabId)) {
      saveSidebarShortcuts([...sidebarShortcuts, { id: tabId, label: match.label }]);
    }
    setShowAddShortcut(false);
  }, [sidebarShortcuts, saveSidebarShortcuts, ALL_TABS]);

  const moveShortcut = useCallback((idx: number, dir: -1 | 1) => {
    const next = [...sidebarShortcuts];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= next.length) return;
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    saveSidebarShortcuts(next);
  }, [sidebarShortcuts, saveSidebarShortcuts]);

  const resolvedShortcuts = useMemo(() =>
    sidebarShortcuts
      .map(s => {
        const match = ALL_TABS.find(t => t.id === s.id);
        return match ? { ...s, icon: match.icon } : null;
      })
      .filter(Boolean) as Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }>,
    [sidebarShortcuts, ALL_TABS]
  );

  const availableForShortcut = useMemo(() =>
    ALL_TABS.filter(t => allowedTabs.includes(t.id) && !sidebarShortcuts.some(s => s.id === t.id)),
    [ALL_TABS, allowedTabs, sidebarShortcuts]
  );
  // ────────────────────────────────────────────────────────────────────────────

  const currentTab = filteredTabs.find(t => t.id === tab) ?? filteredTabs[0];

  const commandItems = useMemo(() => {
    const items: Array<{ id: string; label: string; category: string; icon?: string; onSelect: () => void }> = [];

    const modules: Array<{ id: Tab; label: string; icon: string; category: string }> = [
      { id: "asistente-ia",   label: "Asistente IA",            icon: "🧠", category: "Módulo" },
      { id: "ventas-caja",    label: "Ventas & Caja (POS)",     icon: "🖥️", category: "Módulo" },
      { id: "inventario",     label: "Inventario & Almacenes",  icon: "📦", category: "Módulo" },
      { id: "productos",      label: "Productos & Precios",     icon: "🏪", category: "Módulo" },
      { id: "compras",        label: "Compras & Proveedores",   icon: "📋", category: "Módulo" },
      { id: "plata",          label: "Mi Plata (Finanzas)",     icon: "💵", category: "Módulo" },
      { id: "clientes",       label: "Mis Clientes (CRM)",      icon: "👥", category: "Módulo" },
      { id: "analytics-pro",  label: "Analytics Pro",           icon: "📊", category: "Módulo" },
      { id: "fiados",         label: "Fiados",                  icon: "💰", category: "Módulo" },
      { id: "turnos",         label: "Turnos de Caja",          icon: "⏱️", category: "Módulo" },
      { id: "recetas",        label: "Recetas & Producción",    icon: "🍳", category: "Módulo" },
      { id: "prestamos",      label: "Préstamos",               icon: "🏦", category: "Módulo" },
      { id: "pedidos",        label: "Pedidos",                 icon: "🛒", category: "Módulo" },
      { id: "cotizaciones",   label: "Cotizaciones",            icon: "📄", category: "Documento" },
      { id: "guias-remision", label: "Guías de Remisión",       icon: "🚚", category: "Documento" },
      { id: "notas-credito",  label: "Notas de Crédito",        icon: "📝", category: "Documento" },
      { id: "contratos",      label: "Contratos",               icon: "📑", category: "Documento" },
      { id: "config",         label: "Configuración",           icon: "⚙️", category: "Sistema" },
      { id: "plan",           label: "Plan & Suscripción",      icon: "⚡", category: "Sistema" },
    ];

    modules.forEach(m => {
      items.push({ ...m, onSelect: () => navigateTab(m.id) });
    });

    items.push(
      { id: "action-new-sale",     label: "Nueva venta (POS)",  icon: "➕", category: "Acción", onSelect: () => navigateTab("ventas-caja") },
      { id: "action-new-product",  label: "Nuevo producto",     icon: "➕", category: "Acción", onSelect: () => navigateTab("productos") },
      { id: "action-new-customer", label: "Nuevo cliente",      icon: "➕", category: "Acción", onSelect: () => navigateTab("clientes") },
      { id: "action-inventario",   label: "Ver stock",          icon: "🔍", category: "Acción", onSelect: () => navigateTab("inventario") },
    );

    return items;
  }, [navigateTab]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="admin-mobile-cards min-h-screen bg-gray-50 dark:bg-background" data-admin-shell="true">
      {/* SuperAdmin impersonation banner — fixed top-0, z-50 */}
      {isSuperAdminImpersonating && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-3 h-10 px-4">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Viendo como SuperAdmin —{" "}
            <span className="font-bold">{activeTenantName ?? activeTenantSlug ?? "tienda"}</span>
          </span>
          <button
            type="button"
            onClick={handleExitImpersonation}
            className="ml-3 flex items-center gap-1 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-2.5 py-0.5 text-xs font-bold"
          >
            <LogOut className="w-3 h-3" />
            Salir
          </button>
        </div>
      )}

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 sm:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 w-72 z-50 bg-white dark:bg-card shadow-2xl flex flex-col transition-transform duration-300 sm:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-card-border bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-primary text-white flex items-center justify-center">
              <ShoppingBasket className="h-4 w-4" />
            </div>
            <span className="font-extrabold text-gray-900 dark:text-foreground text-sm">{activeTenantName || "Mi Bodega"}</span>
          </div>
          <button onClick={() => setMobileNavOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-gray-500 dark:text-muted" />
          </button>
        </div>
        
        {/* Category selector (mobile) */}
        <div className="relative px-3 py-3 border-b border-gray-200 dark:border-card-border">
          <button
            onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-foreground bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-accent transition-all border border-gray-200 dark:border-card-border"
          >
            <div className="flex items-center gap-2">
              {selectedCategory ? (
                <>
                  {visibleCategories.find(c => c.id === selectedCategory)?.icon && (
                    React.createElement(visibleCategories.find(c => c.id === selectedCategory)!.icon, { className: "h-4 w-4 shrink-0" })
                  )}
                  <span className="truncate">{visibleCategories.find(c => c.id === selectedCategory)?.label}</span>
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Todas las categorías</span>
                </>
              )}
            </div>
            <ChevronDown className={cn("h-4 w-4 transition-transform shrink-0", categoryDropdownOpen && "rotate-180")} />
          </button>
          
          {categoryDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCategoryDropdownOpen(false)} />
              <div className="absolute top-full left-3 right-3 mt-1 bg-white dark:bg-card shadow-xl rounded-xl border border-gray-200 dark:border-card-border z-20 max-h-80 overflow-y-auto py-2">
                <button
                  onClick={() => { setSelectedCategory(null); setCategoryDropdownOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                    !selectedCategory ? "bg-primary/10 text-primary" : "text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                  )}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Todas ({allowedTabs.length})</span>
                </button>
                <div className="h-px bg-gray-100 dark:bg-card-border my-1" />
                {visibleCategories.map(category => {
                  const count = category.tabs.filter(t => allowedTabs.includes(t)).length;
                  if (count === 0) return null;
                  const CategoryIcon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => { setSelectedCategory(category.id); setCategoryDropdownOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                        selectedCategory === category.id ? "bg-primary/10 text-primary" : "text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                      )}
                    >
                      <CategoryIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1 text-left">{category.label}</span>
                      <span className="text-xs text-gray-400 dark:text-muted">({count})</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {/* Favorite tabs section */}
          {(favoriteTabItems.length > 0 || customShortcutItems.length > 0) && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1"><Star className="h-3 w-3" /> Favoritos</p>
              {favoriteTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`fav-${id}`}
                  onClick={() => { navigateTab(id); setMobileNavOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              {customShortcutItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`sc-${id}-${label}`}
                  onClick={() => { navigateTab(id); setMobileNavOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-accent"
                  )}
                >
                  <Zap className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* Recent tabs section */}
          {recentTabItems.length > 0 && (
            <div className="mb-2">
              <button onClick={() => setRecentCollapsed(c => !c)} className="w-full text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1 hover:text-gray-600 dark:hover:text-foreground transition-colors">
                <Clock className="h-3 w-3" /> Recientes
                {recentCollapsed ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronUp className="h-3 w-3 ml-auto" />}
              </button>
              {!recentCollapsed && recentTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`rec-${id}`}
                  onClick={() => { navigateTab(id); setMobileNavOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* All tabs */}
          {filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { navigateTab(id); setMobileNavOpen(false); }}
              className={cn(
                "group w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-1",
                tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate flex-1 text-left">{label}</span>
              {DEMO_DATA_MODULES[id] && !clearedDemoTabs.has(id) && (
                <span title="Contiene datos de ejemplo" className={cn("h-2 w-2 rounded-full shrink-0", tab === id ? "bg-red-300" : "bg-red-500")} />
              )}
              {alerts[id] && <span className={cn("text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center", tab === id ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{alerts[id]}</span>}
              <Star
                onClick={e => { e.stopPropagation(); toggleFavorite(id); }}
                className={cn(
                  "h-4 w-4 shrink-0 transition-all cursor-pointer",
                  favoriteTabs.has(id) ? "fill-amber-400 text-amber-400" : "opacity-0 group-hover:opacity-60 text-gray-400"
                )}
              />
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-200 dark:border-card-border space-y-1">
          {/* Quick access shortcuts — mobile */}
          <div className="mb-2 space-y-0.5">
            <div className="flex items-center justify-between px-4 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Accesos rápidos</p>
              <button onClick={() => setEditingShortcuts(e => !e)} className="text-gray-400 hover:text-primary transition-colors" title="Editar accesos rápidos">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            {resolvedShortcuts.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-1">
                {editingShortcuts && (
                  <div className="flex flex-col -mr-1">
                    <button onClick={() => moveShortcut(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-primary disabled:opacity-20 p-0 leading-none"><ChevronUp className="h-3 w-3" /></button>
                    <button onClick={() => moveShortcut(idx, 1)} disabled={idx === resolvedShortcuts.length - 1} className="text-gray-400 hover:text-primary disabled:opacity-20 p-0 leading-none"><ChevronDown className="h-3 w-3" /></button>
                  </div>
                )}
                <button
                  onClick={() => { if (!editingShortcuts) { navigateTab(s.id as Tab); setMobileNavOpen(false); } }}
                  className={cn(
                    "flex-1 flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                    tab === s.id ? "bg-primary/10 text-primary" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <s.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{s.label}</span>
                  {!editingShortcuts && alerts[s.id] && <span className="ml-auto text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center bg-red-500 text-white">{alerts[s.id]}</span>}
                </button>
                {editingShortcuts && (
                  <button onClick={() => removeShortcut(s.id)} className="p-1 text-red-400 hover:text-red-600 transition-colors" title="Quitar"><X className="h-3.5 w-3.5" /></button>
                )}
              </div>
            ))}
            {editingShortcuts && (
              <div className="relative">
                <button
                  onClick={() => setShowAddShortcut(v => !v)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-medium text-primary/70 hover:bg-primary/5 transition-all border border-dashed border-primary/30"
                >
                  <Plus className="h-4 w-4" /> Agregar acceso
                </button>
                {showAddShortcut && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {availableForShortcut.map(t => (
                      <button key={t.id} onClick={() => addShortcut(t.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                        <t.icon className="h-4 w-4 shrink-0" /> {t.label}
                      </button>
                    ))}
                    {availableForShortcut.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Ya están todos agregados</p>}
                  </div>
                )}
              </div>
            )}
          </div>
          <Link href="/marketplace" target="_blank" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all">
              <Globe className="h-5 w-5" /> Marketplace
            </Link>
          <Link href="/" target="_blank" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-all">
              <Store className="h-5 w-5" /> Tienda
            </Link>
          <button
            onClick={() => { setShowCierreDiario(true); setMobileNavOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all"
          >
            <Power className="h-5 w-5" /> Cerrar d&iacute;a
          </button>
        </div>
      </aside>

      {/* Desktop permanent sidebar */}
      <aside className={cn(
        "hidden sm:flex fixed left-0 bottom-0 z-40 bg-white dark:bg-card border-r border-gray-200 dark:border-card-border flex-col transition-all duration-300 overflow-hidden",
        focusMode ? "w-16" : "w-64",
        presentationMode && "hidden!",
        isSuperAdminImpersonating ? "top-10" : "top-0"
      )}>
        <div className={cn("flex items-center gap-3 py-5 border-b border-gray-200 dark:border-card-border bg-primary/5 transition-all duration-300", focusMode ? "px-3 justify-center" : "px-5")}>
          {activeTenantLogo ? (
            <img src={activeTenantLogo} alt={activeTenantName || "Logo"} className="h-9 w-9 rounded-xl object-cover shadow-sm shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm shrink-0">
              <ShoppingBasket className="h-5 w-5" />
            </div>
          )}
          {!focusMode && (
            <>
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-gray-900 dark:text-foreground text-sm leading-tight">{activeTenantName || "Mi Bodega"}</p>
                <p className="text-xs text-gray-400 dark:text-muted"><span className="capitalize">{userName}</span> · <span className="uppercase text-[10px] font-bold text-primary">{userRole}</span></p>
              </div>

            </>
          )}
        </div>
        
        <nav className={cn("flex-1 overflow-y-auto py-3 transition-all duration-300", focusMode ? "px-1" : "px-3")}>
          {/* Favorite tabs section — hidden in focus mode */}
          {!focusMode && (favoriteTabItems.length > 0 || customShortcutItems.length > 0) && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1"><Star className="h-3 w-3" /> Favoritos</p>
              {favoriteTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`fav-${id}`}
                  onClick={() => navigateTab(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              {customShortcutItems.map(({ id, label }) => (
                <button
                  key={`sc-${id}-${label}`}
                  onClick={() => navigateTab(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-accent"
                  )}
                >
                  <Zap className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* Recent tabs section — hidden in focus mode */}
          {!focusMode && recentTabItems.length > 0 && (
            <div className="mb-2">
              <button onClick={() => setRecentCollapsed(c => !c)} className="w-full text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1 hover:text-gray-600 dark:hover:text-foreground transition-colors">
                <Clock className="h-3 w-3" /> Recientes
                {recentCollapsed ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronUp className="h-3 w-3 ml-auto" />}
              </button>
              {!recentCollapsed && recentTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`rec-${id}`}
                  onClick={() => navigateTab(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* Category accordion — normal mode, no search */}
          {!focusMode && visibleCategories.map(category => {
            const catTabs = category.tabs.filter(t => allowedTabs.includes(t) && !hiddenTabs.has(t as Tab));
            if (catTabs.length === 0) return null;
            const CategoryIcon = category.icon;
            const isSingleTab = catTabs.length === 1;
            const isOpen = openAccordionCategories.has(category.id);
            const isActive = isSingleTab ? tab === catTabs[0] : isOpen;
            return (
              <div key={category.id} className="mb-0.5">
                <button
                  onClick={() => {
                    if (isSingleTab) {
                      navigateTab(catTabs[0] as Tab);
                    } else {
                      setOpenAccordionCategories(prev =>
                        prev.has(category.id) ? new Set() : new Set([category.id])
                      );
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (isSingleTab) return;
                    if (flyoutTimerRef2.current) clearTimeout(flyoutTimerRef2.current);
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setSidebarFlyout({ categoryId: category.id, top: rect.top });
                  }}
                  onMouseLeave={() => { if (!isSingleTab) flyoutTimerRef2.current = setTimeout(() => setSidebarFlyout(null), 150); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    isActive ? "bg-primary/10 text-primary" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <CategoryIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{category.label}</span>
                  {!isSingleTab && (
                    <>
                      <span className="text-[10px] font-bold text-gray-400 dark:text-muted tabular-nums">{catTabs.length}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-gray-400", isOpen && "rotate-180")} />
                    </>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && !isSingleTab && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="pl-3 pr-1 pt-0.5 pb-1">
                        {catTabs.map(tabId => {
                          const tabInfo = ALL_TABS.find(t => t.id === tabId);
                          if (!tabInfo) return null;
                          const TabIcon = tabInfo.icon;
                          return (
                            <button
                              key={tabId}
                              data-tour-tab={tabId}
                              onClick={() => navigateTab(tabId as Tab)}
                              className={cn(
                                "group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all mb-0.5",
                                tab === tabId ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                              )}
                            >
                              <TabIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate flex-1 text-left">{tabInfo.label}</span>
                              {DEMO_DATA_MODULES[tabId as Tab] && !clearedDemoTabs.has(tabId as Tab) && (
                                <span title="Datos de ejemplo" className={cn("h-1.5 w-1.5 rounded-full shrink-0", tab === tabId ? "bg-red-300" : "bg-red-500")} />
                              )}
                              {alerts[tabId] && <span className={cn("text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center", tab === tabId ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{alerts[tabId]}</span>}
                              <Star
                                onClick={e => { e.stopPropagation(); toggleFavorite(tabId as Tab); }}
                                className={cn("h-3.5 w-3.5 shrink-0 transition-all cursor-pointer", favoriteTabs.has(tabId as Tab) ? "fill-amber-400 text-amber-400" : "opacity-0 group-hover:opacity-60 text-gray-400")}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {/* Flat list when searching */}
          {!focusMode && sidebarSearch && filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-tour-tab={id}
              onClick={() => navigateTab(id)}
              className={cn(
                "group w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1",
                tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1 text-left">{label}</span>
              {DEMO_DATA_MODULES[id] && !clearedDemoTabs.has(id) && (
                <span title="Datos de ejemplo" className={cn("h-2 w-2 rounded-full shrink-0", tab === id ? "bg-red-300" : "bg-red-500")} />
              )}
              {alerts[id] && <span className={cn("text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center", tab === id ? "bg-white/20 text-white" : "bg-red-500 text-white")}>{alerts[id]}</span>}
            </button>
          ))}
          {/* Icon-only in focus mode */}
          {focusMode && filteredTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-tour-tab={id}
              onClick={() => navigateTab(id)}
              title={label}
              className={cn(
                "w-full flex items-center justify-center rounded-xl text-sm font-semibold transition-all mb-1 px-0 py-2.5",
                tab === id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
            </button>
          ))}
        </nav>
        <div className={cn("py-4 border-t border-gray-200 dark:border-card-border space-y-1 transition-all duration-300", focusMode ? "px-1" : "px-3")}>
          {/* Quick access shortcuts */}
          {!focusMode && (
            <div className="mb-2 space-y-0.5">
              <div className="flex items-center justify-between px-4 mb-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Accesos rápidos</p>
                <button onClick={() => setEditingShortcuts(e => !e)} className="text-gray-400 hover:text-primary transition-colors" title="Editar accesos rápidos">
                  {editingShortcuts ? <Check className="h-3 w-3 text-primary" /> : <Pencil className="h-3 w-3" />}
                </button>
              </div>
              {resolvedShortcuts.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-1">
                  {editingShortcuts && (
                    <div className="flex flex-col -mr-1">
                      <button onClick={() => moveShortcut(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-primary disabled:opacity-20 p-0 leading-none"><ChevronUp className="h-3 w-3" /></button>
                      <button onClick={() => moveShortcut(idx, 1)} disabled={idx === resolvedShortcuts.length - 1} className="text-gray-400 hover:text-primary disabled:opacity-20 p-0 leading-none"><ChevronDown className="h-3 w-3" /></button>
                    </div>
                  )}
                  <button
                    onClick={() => { if (!editingShortcuts) navigateTab(s.id as Tab); }}
                    className={cn(
                      "flex-1 flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                      tab === s.id ? "bg-primary/10 text-primary" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                    )}
                  >
                    <s.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{s.label}</span>
                    {!editingShortcuts && alerts[s.id] && <span className="ml-auto text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center bg-red-500 text-white">{alerts[s.id]}</span>}
                  </button>
                  {editingShortcuts && (
                    <button onClick={() => removeShortcut(s.id)} className="p-1 text-red-400 hover:text-red-600 transition-colors" title="Quitar"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ))}
              {editingShortcuts && (
                <div className="relative">
                  <button
                    onClick={() => setShowAddShortcut(v => !v)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-medium text-primary/70 hover:bg-primary/5 transition-all border border-dashed border-primary/30"
                  >
                    <Plus className="h-4 w-4" /> Agregar acceso
                  </button>
                  {showAddShortcut && (
                    <div className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {availableForShortcut.map(t => (
                        <button key={t.id} onClick={() => addShortcut(t.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                          <t.icon className="h-4 w-4 shrink-0" /> {t.label}
                        </button>
                      ))}
                      {availableForShortcut.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Ya están todos agregados</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {focusMode && (
            <div className="mb-2 space-y-0.5">
              {resolvedShortcuts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigateTab(s.id as Tab)}
                  title={s.label}
                  className={cn(
                    "w-full flex items-center justify-center rounded-xl text-sm font-semibold transition-all px-0 py-2",
                    tab === s.id ? "bg-primary text-white shadow-sm" : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <s.icon className="h-4.5 w-4.5 shrink-0" />
                </button>
              ))}
            </div>
          )}
          <Link href="/marketplace" target="_blank" title={focusMode ? "Marketplace" : undefined} className={cn("flex items-center rounded-xl text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all", focusMode ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-3")}>
            <Globe className="h-5 w-5" /> {!focusMode && "Marketplace"}
          </Link>
          <Link href="/tienda" target="_blank" title={focusMode ? "Tienda" : undefined} className={cn("flex items-center rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-all", focusMode ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-3")}>
            <Store className="h-5 w-5" /> {!focusMode && "Tienda"}
          </Link>
        </div>
      </aside>

      {/* Sidebar category flyout panel — only for multi-tab categories */}
      {!focusMode && sidebarFlyout && (() => {
        const cat = visibleCategories.find(c => c.id === sidebarFlyout.categoryId);
        if (!cat) return null;
        const catTabs = cat.tabs.filter(t => allowedTabs.includes(t));
        if (catTabs.length <= 1) return null;
        const FlyoutCatIcon = cat.icon;
        return (
          <motion.div
            key={sidebarFlyout.categoryId}
            initial={{ opacity: 0, x: -8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", top: sidebarFlyout.top, left: 264, zIndex: 50 }}
            onMouseEnter={() => { if (flyoutTimerRef2.current) clearTimeout(flyoutTimerRef2.current); }}
            onMouseLeave={() => { flyoutTimerRef2.current = setTimeout(() => setSidebarFlyout(null), 150); }}
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-2xl py-2 w-60 max-h-[80vh] overflow-y-auto"
          >
            {catTabs.map(tabId => {
              const tabInfo = ALL_TABS.find(t => t.id === tabId);
              if (!tabInfo) return null;
              const FlyoutTabIcon = tabInfo.icon;
              return (
                <button
                  key={tabId}
                  onClick={() => { navigateTab(tabId as Tab); setSidebarFlyout(null); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
                    tab === tabId
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface font-medium"
                  )}
                >
                  <FlyoutTabIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{tabInfo.label}</span>
                  {tab === tabId && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        );
      })()}

      {/* Content area */}
      <div className={cn("flex flex-col min-h-screen transition-[margin] duration-300", presentationMode ? "sm:ml-0" : focusMode ? "sm:ml-16" : "sm:ml-64")}>
      {/* Top bar */}
      <header className={cn(
        "bg-white dark:bg-card border-b border-gray-200 dark:border-card-border px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2 sticky z-40",
        presentationMode && "hidden!",
        isSuperAdminImpersonating ? "top-10" : "top-0"
      )}>
        {/* Left: hamburger (mobile) + search */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="sm:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors shrink-0"
            aria-label="Menú"
          >
            <Menu className="h-5 w-5 text-gray-600 dark:text-muted" />
          </button>
          {/* Search bar — centered and prominent */}
          <button
            onClick={() => setSearchOpen(true)}
            title="Busqueda global (Ctrl+K)"
            className="flex items-center gap-2.5 px-4 h-10 rounded-2xl text-gray-400 dark:text-muted bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-all text-sm font-medium border border-gray-200 dark:border-card-border flex-1 max-w-xl group cursor-pointer"
          >
            <Search className="h-4.5 w-4.5 shrink-0 group-hover:text-primary transition-colors" />
            <span className="flex-1 text-left text-gray-400 dark:text-muted truncate">Buscar módulos, productos, clientes...</span>
            <kbd className="text-[10px] bg-white dark:bg-card px-2 py-0.5 rounded-lg font-mono text-gray-400 border border-gray-200 dark:border-card-border hidden sm:inline">⌘K</kbd>
          </button>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="hidden sm:block">
            <NotificationBell />
          </div>
          <button
            onClick={() => setShowCierreDiario(true)}
            title="Cerrar dia (Ctrl+Shift+C)"
            className="hidden md:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors border border-amber-200 dark:border-amber-800"
          >
            <Power className="h-4 w-4" />
            <span>Cerrar dia</span>
          </button>
          <button
            onClick={toggleFocusMode}
            title={focusMode ? "Salir modo enfoque" : "Modo enfoque"}
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            {focusMode ? <Minimize2 className="h-4 w-4 text-primary" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setPresentationMode(true)}
            title="Modo presentacion (Ctrl+Shift+P)"
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <Eye className="h-4 w-4" />
          </button>
          <AdminUserDropdown
            userName={userName}
            userRole={userRole}
            onNavigate={(t) => navigateTab(t as Tab)}
            onLogout={handleLogout}
          />
        </div>
      </header>

      {/* Command Palette global — Ctrl+K en todo el panel */}
      <AdminCommandPalette items={commandItems} />

      {/* Clear data confirmation modal — extracted to AdminModals */}
      <ClearDataModal
        open={showClearConfirm}
        clearConfirmStep={clearConfirmStep}
        setClearConfirmStep={setClearConfirmStep}
        clearConfirmText={clearConfirmText}
        setClearConfirmText={setClearConfirmText}
        clearCategories={clearCategories}
        setClearCategories={setClearCategories}
        clearingData={clearingData}
        setClearingData={setClearingData}
        onClose={() => setShowClearConfirm(false)}
        demoDataModuleKeys={Object.keys(DEMO_DATA_MODULES)}
      />


      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(t) => navigateTab(t as Tab)}
      />

      {/* ── Cierre Diario Modal ── */}
      <CierreDiarioModal open={showCierreDiario} onClose={() => setShowCierreDiario(false)} />

      {/* ── Changelog Modal ── */}
      <ChangelogModal open={showChangelog} onClose={() => setShowChangelog(false)} />

      {/* ── Module Manager Modal ── */}
      {showModuleManager && (
        <div className="fixed inset-0 z-100 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModuleManager(false)} />
          <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
            <div className="bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border w-full max-w-3xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-card-border">
                <div>
                  <h2 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Gestionar módulos</h2>
                  <p className="text-xs text-gray-400 dark:text-muted mt-0.5">Activa, oculta o limpia datos de ejemplo por módulo</p>
                </div>
                <button onClick={() => setShowModuleManager(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              {/* Stats strip */}
              <div className="px-6 py-3 bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border space-y-2.5">
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-xl font-extrabold text-primary">{allowedTabs.length}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-extrabold text-emerald-600">{allowedTabs.length - hiddenTabs.size}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Visibles</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-extrabold text-gray-400">{hiddenTabs.size}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Ocultos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-extrabold text-red-500">{Object.keys(DEMO_DATA_MODULES).filter(t => !clearedDemoTabs.has(t as Tab)).length}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Con demo</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mr-1">Prioridad:</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">● Esencial</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">● Alta</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">● Media</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">● Normal</span>
                </div>
              </div>
              {/* Tab list */}
              <div className="overflow-y-auto flex-1 py-2">
                {visibleCategories.map(category => {
                  const catTabs = category.tabs.filter(t => allowedTabs.includes(t));
                  if (catTabs.length === 0) return null;
                  const CatIcon = category.icon;
                  return (
                    <div key={category.id} className="mb-1">
                      <div className="flex items-center gap-2 px-6 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted sticky top-0 bg-white dark:bg-card z-10">
                        <CatIcon className="h-3 w-3" />
                        <span>{category.label}</span>
                      </div>
                      {catTabs.map(tabId => {
                        const tabInfo = ALL_TABS.find(t => t.id === tabId);
                        if (!tabInfo) return null;
                        const TabIcon = tabInfo.icon;
                        const isHidden = hiddenTabs.has(tabId as Tab);
                        const hasDemo = !!DEMO_DATA_MODULES[tabId as Tab] && !clearedDemoTabs.has(tabId as Tab);
                        const isClearing = demoClearing === tabId;
                        const moduleInfo = MODULE_INFO[tabId as Tab];
                        const priorityConfig = {
                          core:   { label: "Esencial",  cls: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",     dot: "● " },
                          high:   { label: "Alta",      cls: "bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400", dot: "● " },
                          medium: { label: "Media",     cls: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",  dot: "● " },
                          low:    { label: "Normal",    cls: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",  dot: "● " },
                        };
                        const pCfg = moduleInfo ? priorityConfig[moduleInfo.priority] : null;
                        return (
                          <div key={tabId} className={cn("flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-surface transition-colors", isHidden && "opacity-50")}>
                            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 relative mt-0.5", isHidden ? "bg-gray-100 dark:bg-surface" : "bg-primary/10")}>
                              {moduleInfo?.emoji
                                ? <span className="text-lg leading-none select-none">{moduleInfo.emoji}</span>
                                : <TabIcon className={cn("h-4 w-4", isHidden ? "text-gray-400" : "text-primary")} />
                              }
                              {hasDemo && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn("text-sm font-bold", isHidden ? "text-gray-400" : "text-gray-800 dark:text-foreground")}>{tabInfo.label}</span>
                                {pCfg && (
                                  <span className={cn("shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide", pCfg.cls)}>
                                    {pCfg.dot}{pCfg.label}
                                  </span>
                                )}
                                {hasDemo && (
                                  <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded-full">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                                    Demo
                                  </span>
                                )}
                              </div>
                              {moduleInfo?.desc && (
                                <p className="text-[11px] text-gray-500 dark:text-muted mt-0.5 leading-snug line-clamp-2">{moduleInfo.desc}</p>
                              )}
                              {moduleInfo?.tip && (
                                <p className="text-[11px] text-primary/70 dark:text-primary/60 mt-0.5 leading-snug">💡 {moduleInfo.tip}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              {hasDemo && (
                                <button
                                  onClick={() => clearDemoData(tabId as Tab)}
                                  disabled={isClearing}
                                  className="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Eliminar datos"}
                                </button>
                              )}
                              <button
                                onClick={() => toggleHideTab(tabId as Tab)}
                                title={isHidden ? "Mostrar módulo" : "Ocultar módulo"}
                                className={cn(
                                  "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                                  isHidden
                                    ? "bg-gray-100 dark:bg-surface text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600"
                                    : "bg-primary/10 text-primary hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500"
                                )}
                              >
                                {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-card-border">
                {hiddenTabs.size > 0 ? (
                  <button
                    onClick={() => { setHiddenTabs(new Set()); try { localStorage.removeItem("admin_hidden_tabs"); } catch {} }}
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Mostrar todos ({hiddenTabs.size})
                  </button>
                ) : <div />}
                <button
                  onClick={() => setShowModuleManager(false)}
                  className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <main
        className={cn("flex-1 mx-auto w-full pb-24 sm:pb-8", presentationMode ? "max-w-full px-4 py-4" : "max-w-7xl", compactMode && !presentationMode ? "px-2 sm:px-3 py-2 sm:py-4" : !presentationMode ? "px-3 sm:px-6 py-4 sm:py-8" : "")}
        {...swipeHandlers}
      >
        {/* ── Breadcrumb de navegación ── */}
        {(() => {
          const cat = TAB_CATEGORIES.find(c => c.tabs.includes(tab));
          const modInfo = MODULE_INFO[tab];
          const items = [];
          if (cat && cat.tabs.length > 1) {
            items.push({ label: cat.label, onClick: () => navigateTab(cat.tabs[0]) });
          }
          items.push({ label: modInfo?.emoji ? `${modInfo.emoji} ${modInfo?.desc?.split(".")[0] || tab}` : (cat?.label || tab) });
          return <AdminBreadcrumb items={items} />;
        })()}

        {/* ── Mejora 12: Transición suave al cambiar módulo ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* ── 1. Asistente IA ── */}
            {tab === "asistente-ia" && (
              <AsistenteIAModule />
            )}
            {/* ── 2. Ventas & Caja ── */}
            {tab === "ventas-caja" && <POSCajaModule />}
            {/* ── 3. Inventario ── */}
            {tab === "inventario" && <InventarioAlmacenesModule />}
            {/* ── 4. Productos & Precios ── */}
            {tab === "productos" && <CatalogoTiendaModule />}
            {/* ── 5. Compras ── */}
            {tab === "compras" && <ComprasModule />}
            {/* ── 6. Mi Plata ── */}
            {tab === "plata" && <FinanzasModule />}
            {/* ── 7. Mis Clientes ── */}
            {tab === "clientes" && <CRMClientesModule />}
            {/* ── Módulos adicionales ── */}
            {tab === "fiados" && <FiadosModule />}
            {tab === "turnos" && <TurnosModule />}
            {tab === "recetas" && <RecetasModule />}
            {tab === "prestamos" && <PrestamosModule />}
            {/* ── Documentos ── */}
            {tab === "cotizaciones" && <CotizacionesModule />}
            {tab === "guias-remision" && <GuiasRemisionModule />}
            {tab === "notas-credito" && <NotasCreditoModule />}
            {tab === "contratos" && <ContratosModule />}
            {/* ── Módulos nuevos ── */}
            {tab === "auditoria" && <AuditTrailModule />}
            {tab === "devoluciones-proveedor" && <DevolucionesProveedorModule />}
            {tab === "tesoreria" && <TreasuryDashboard />}
            {tab === "promociones" && <PromocionesModule />}
            {tab === "scoring" && <ScoringCrediticioTab />}
            {/* Declaración Inventario movido dentro del módulo Inventario */}
            {/* ── 8. Configuración ── */}
            {tab === "config" && (
              <div className="space-y-8">
                <SettingsModule storeMode={storeMode} onModeChange={setStoreModeState} />
                <div className="pt-8 border-t border-gray-200 dark:border-card-border">
                  {/* Mejora 16 (R3): Sección con icono y subtítulo descriptivo */}
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
                    categories={visibleCategories.map(c => ({ id: c.id, label: c.label }))}
                    onSave={saveCategoryOrder}
                  />
                </div>
                {/* ── Repetir tutorial ── */}
                <div className="pt-8 border-t border-gray-200 dark:border-card-border">
                  <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                        <span className="text-xl">🎓</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-foreground text-sm">Tutorial de bienvenida</p>
                        <p className="text-xs text-gray-500 dark:text-muted">Repasa cómo funciona cada sección del panel</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onboarding.resetTour();
                        setTab("asistente-ia");
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-primary-dark shadow-sm transition-colors shrink-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Repetir tutorial de bienvenida
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* ── Especiales ── */}
            {tab === "pedidos" && <OrdersTab />}
            {tab === "plan" && <PlanTab />}
            {/* ── Módulos avanzados ── */}
            {tab === "analytics-pro" && <AnalyticsProModule />}
            {tab === "ai-command" && <AICommandModule />}
            {tab === "sugerencias-ia" && <SugerenciasIAModule />}
            {tab === "metas-logros" && <MetasLogrosModule />}
            {/* ── Marketplace & Delivery ── */}
            {tab === "marketplace" && <MarketplaceModule />}
            {tab === "delivery-partners" && <DeliveryPartnersModule />}
            {/* ── Rendimiento técnico ── */}
            {tab === "rendimiento" && <RendimientoModule />}

            {tab === "store-customizer" && <StoreCustomizer />}
            {tab === "colas" && <ColasTab />}
            {tab === "mi-perfil" && <MiPerfilTab />}
          </motion.div>
        </AnimatePresence>

      </main>

      {/* Focus mode floating expand toggle — only on desktop */}
      {focusMode && !presentationMode && (
        <button
          onClick={toggleFocusMode}
          className="hidden sm:flex fixed bottom-6 left-4 z-50 h-10 w-10 rounded-full bg-primary text-white shadow-lg items-center justify-center hover:bg-primary/90 transition-all"
          title="Expandir sidebar"
        >
          <Maximize2 className="h-5 w-5" />
        </button>
      )}

      {/* Presentation mode — floating exit button */}
      {presentationMode && (
        <button
          onClick={() => setPresentationMode(false)}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-black/30 backdrop-blur-md text-white/80 text-sm font-semibold hover:bg-black/50 hover:text-white transition-all shadow-lg"
          title="Salir de presentación (Ctrl+Shift+P)"
        >
          <EyeOff className="h-4 w-4" />
          Salir
        </button>
      )}

      {/* Keyboard shortcuts modal — extracted to AdminModals */}
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* ── Mobile quick-tab bottom bar ─────────────────────────────────────── */}
      {(() => {
        const MOBILE_PRIORITY: Record<string, Tab[]> = {
          admin:      ["asistente-ia", "ventas-caja", "pedidos", "inventario"],
          cajero:     ["asistente-ia", "ventas-caja", "pedidos", "clientes"],
          almacenero: ["asistente-ia", "inventario", "compras", "plata"],
        };
        const priorityIds = MOBILE_PRIORITY[userRole] ?? MOBILE_PRIORITY.admin;
        const quickTabs = priorityIds
          .map(id => filteredTabs.find(t => t.id === id))
          .filter((t): t is NonNullable<typeof t> => t != null);
        return (
          <nav
            className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-card border-t border-gray-200 dark:border-card-border flex items-stretch"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
            aria-label="Navegación rápida"
          >
            {quickTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => navigateTab(id)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors relative",
                  tab === id ? "text-primary" : "text-gray-400 dark:text-muted"
                )}
                aria-current={tab === id ? "page" : undefined}
              >
                {alerts[id] ? (
                  <span className="relative inline-flex">
                    <Icon className="h-5 w-5" />
                    <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center px-0.5">{alerts[id]}</span>
                  </span>
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                <span className="leading-tight truncate max-w-14">{label}</span>
                {tab === id && <span className="absolute top-0 inset-x-0 h-0.5 bg-primary" />}
              </button>
            ))}
            {(() => {
              const otherAlerts = Object.entries(alerts)
                .filter(([id]) => !priorityIds.includes(id as Tab))
                .reduce((sum, [, v]) => sum + v, 0);
              return (
                <button
                  onClick={() => setMobileNavOpen(true)}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-muted transition-colors"
                  aria-label="Más opciones"
                >
                  <span className="relative inline-flex">
                    <Menu className="h-5 w-5" />
                    {otherAlerts > 0 && (
                      <span className="absolute -top-1 -right-2 min-w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center px-0.5">{otherAlerts}</span>
                    )}
                  </span>
                  <span className="leading-tight">Más</span>
                </button>
              );
            })()}
          </nav>
        );
      })()}
      <SSEListener />
      <MorningSummaryModal />
      {showOnboarding && (
        <OnboardingWizard
          tenantSlug={activeTenantSlug ?? "main"}
          onClose={() => setShowOnboarding(false)}
        />
      )}
      <OnboardingTour
        isTourActive={onboarding.isTourActive}
        currentStep={onboarding.currentStep}
        totalSteps={onboarding.totalSteps}
        onNext={onboarding.nextStep}
        onPrev={onboarding.prevStep}
        onSkip={onboarding.skipTour}
        onComplete={onboarding.completeTour}
        onNavigateTab={navigateTab}
      />
      </div>
    </div>
  );
}

// Export as client-only (no SSR) to prevent hydration mismatches.
// Admin dashboard is auth-gated and fully dynamic — SSR provides no benefit.
const AdminPageNoSSR = dynamic(
  () => Promise.resolve({ default: AdminPage }),
  { ssr: false }
);
export default AdminPageNoSSR;
