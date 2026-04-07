"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/hooks/use-notifications";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTokenRefresh } from "@/hooks/use-token-refresh";
import { OnboardingTour } from "@/components/admin/OnboardingTour";
import {
  Check, X,
  Users, Star, ShoppingBasket, ShoppingCart,
  Loader2, Truck, FileText, Settings, Store,
  Clock, Activity,
  Brain,
  Package, FlaskConical,
  DollarSign, Layers,
  ChevronDown, ChevronUp,
  Zap, Tag, Landmark,
  ClipboardList, Power,
  Palette, CircleUser, Globe, Pencil, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import { MODULE_PERMISSIONS } from "@/lib/module-permissions";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import { ShortcutsModal, ClearDataModal } from "@/components/admin/AdminModals";
import type { Tab } from "./_lib/tabs.types";
import { TabSpinner } from "./_lib/tab-spinner";
import {
  DEMO_DATA_MODULES,
  MODULE_INFO,
  type TabCategory,
  TAB_CATEGORIES,
} from "./_lib/tab-categories";
import { useAdminTabs } from "./_hooks/useAdminTabs";
import { useAdminModals } from "./_hooks/useAdminModals";
import { AdminImpersonationBanner } from "@/components/admin/AdminImpersonationBanner";
import { AdminTenantBar } from "@/components/admin/AdminTenantBar";
import { AdminTopHeader } from "@/components/admin/AdminTopHeader";
import { AdminFloatingButtons } from "@/components/admin/AdminFloatingButtons";
import { AdminMobileBottomBar } from "@/components/admin/AdminMobileBottomBar";
import { AdminModuleManagerModal } from "@/components/admin/AdminModuleManagerModal";
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
import { useDocumentTitle } from "./_hooks/useDocumentTitle";
import { useSwipeNavigation } from "./_hooks/useSwipeNavigation";
import { useAdminNavigateEvent } from "./_hooks/useAdminNavigateEvent";
import { useSidebarShortcuts } from "./_hooks/useSidebarShortcuts";
import { useClearDataFlow } from "./_hooks/useClearDataFlow";
import { useCustomShortcuts } from "./_hooks/useCustomShortcuts";
import { useCommandItems } from "./_hooks/useCommandItems";

// ── Módulos de tab movidos a TabRouter (código splitting centralizado) ──
// Los dynamic imports de todos los módulos admin viven ahora en _components/TabRouter.tsx
import { TabRouter } from "./_components/TabRouter";

import SSEListener from "@/components/admin/SSEListener";
import AdminCommandPalette from "@/components/admin/shared/AdminCommandPalette";

// Changelog + Export
const ChangelogModal = dynamic(() => import("@/components/admin/ChangelogModal"), { ssr: false });

// Utility components (not tab modules)
const GlobalSearch = dynamic(() => import("@/components/admin/GlobalSearch"), { ssr: false });
const CierreDiarioModal = dynamic(() => import("@/components/cierre-diario/CierreDiarioModal"), { ssr: false });
const MorningSummaryModal = dynamic(() => import("@/components/admin/MorningSummaryModal"), { ssr: false });
const OnboardingWizard = dynamic(() => import("@/components/admin/OnboardingWizard"), { ssr: false });
const ResumenGlobal = dynamic(() => import("@/components/admin/ResumenGlobal"), { ssr: false });

// DEMO_DATA_MODULES, MODULE_INFO, TabCategory, BASIC_MODULES, TIENDA_MODULE,
// CONFIG_MODULE y TAB_CATEGORIES extraídos a ./_lib/tab-categories.ts
// (Sesión 2 del refactor — ver docs/refactor-giant-files-plan.md)

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

  // Estado de tab (URL/hash/localStorage + TAB_MIGRATION) → useAdminTabs (más abajo, requiere addRecent)
  const onboarding = useOnboarding();
  // Silent token refresh — rotates access token every 12 min (expires at 15 min)
  useTokenRefresh();
  // storeMode → useAdminAuth (compartido con el resto del flujo de auth)
  // Layout state (mobileNavOpen, compactMode, focusMode, presentationMode)
  // extraído a useAdminLayout — ver app/admin/_hooks/useAdminLayout.ts
  const {
    mobileNavOpen, setMobileNavOpen,
    compactMode,
    focusMode, toggleFocusMode,
    presentationMode, setPresentationMode,
  } = useAdminLayout();
  // showShortcuts/searchOpen/showModuleManager/showCierreDiario/showChangelog → useAdminModals (más abajo)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // null = "Todas"
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showModuleHelp, setShowModuleHelp] = useState(false);
  // favoriteTabs/recentTabs/toggleFavorite/addRecent → useFavoritesAndRecent
  const { favoriteTabs, toggleFavorite, recentTabs, addRecent } = useFavoritesAndRecent();
  // Estado de tab activa + navegación (URL/hash/localStorage + TAB_MIGRATION) → useAdminTabs
  const { tab, setTab, navigateTab } = useAdminTabs(addRecent);
  // Modals globales (atajos, búsqueda, gestor de módulos, cierre diario, changelog) → useAdminModals
  const {
    showShortcuts, setShowShortcuts,
    searchOpen, setSearchOpen,
    showModuleManager, setShowModuleManager,
    showCierreDiario, setShowCierreDiario,
    showChangelog, setShowChangelog,
  } = useAdminModals();
  const [recentCollapsed, setRecentCollapsed] = useState(true);
  // Clear data wizard state → useClearDataFlow
  // (seedingData borrado: estaba declarado pero nunca usado)
  const {
    showClearConfirm, setShowClearConfirm,
    clearConfirmStep, setClearConfirmStep,
    clearConfirmText, setClearConfirmText,
    clearingData, setClearingData,
    clearCategories, setClearCategories,
  } = useClearDataFlow();
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [openAccordionCategories, setOpenAccordionCategories] = useState<Set<string>>(new Set());
  const [sidebarFlyout, setSidebarFlyout] = useState<{ categoryId: string; top: number } | null>(null);
  const flyoutTimerRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  // hiddenTabs/toggleHideTab/clearAllHiddenTabs → useHiddenTabs
  const { hiddenTabs, toggleHideTab, clearAllHiddenTabs } = useHiddenTabs();
  // clearedDemoTabs/demoClearing/clearDemoData → useDemoCleanup (dismissDemoTab no se usa fuera del hook)
  const { clearedDemoTabs, demoClearing, clearDemoData } = useDemoCleanup(DEMO_DATA_MODULES);
  // categoryOrder/saveCategoryOrder → useCategoryOrder
  const { categoryOrder, saveCategoryOrder } = useCategoryOrder();
  // showOnboarding → useOnboardingTrigger
  const { showOnboarding, setShowOnboarding } = useOnboardingTrigger();
  // changelogHasNew (badge de novedades) — variable mantenida por si se reactiva el badge
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const changelogHasNew = useChangelogBadge();

  // Cierra el panel "module help" inline cuando cambia la tab activa
  // (antes vivía dentro de navigateTab; ahora declarativo y desacoplado del hook)
  useEffect(() => {
    setShowModuleHelp(false);
  }, [tab]);

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
    activeTenantLogo,
    handleExit: handleExitImpersonation,
  } = useImpersonation();

  // useScrollLock + handlers Escape/Resize → ahora viven en useAdminLayout
  const { toggle: toggleTheme } = useTheme();
  const { permission, requestPermission, sendNotification, hasAsked } = useNotifications();

  // Auth + settings inicial → useAdminAuth (arriba)
  // webhookPendingCount → useWebhookPendingCount (badge sidebar — se reserva para reactivar el UI badge)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const webhookPendingCount = useWebhookPendingCount(userRole);

  // toggleFavorite ahora vive en useFavoritesAndRecent
  // navigateTab ahora vive en useAdminTabs (incluye URL/hash/localStorage + addRecent)

  // Listener evento admin:navigate → useAdminNavigateEvent
  useAdminNavigateEvent(navigateTab);

  // Document title + scroll-to-top → useDocumentTitle
  useDocumentTitle(tab, activeTenantName);

  // Swipe handlers para mobile → useSwipeNavigation
  const swipeHandlers = useSwipeNavigation(tab, navigateTab, TAB_CATEGORIES);

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

  // alerts + quickStats (polling + SSE) → useAdminAlerts (fetchAlerts queda interno al hook)
  const { alerts, quickStats } = useAdminAlerts(authReady);

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

  // Custom shortcuts (de SettingsModule) → useCustomShortcuts
  const customShortcutItems = useCustomShortcuts(ALL_TABS);

  const recentTabItems = recentTabs
    .filter(id => id !== tab && !favoriteTabs.has(id) && allowedTabs.includes(id))
    .map(id => ALL_TABS.find(t => t.id === id)!)
    .filter(Boolean)
    .slice(0, 5);

  // Sidebar shortcuts → useSidebarShortcuts
  const {
    editingShortcuts, setEditingShortcuts,
    showAddShortcut, setShowAddShortcut,
    removeShortcut, addShortcut, moveShortcut,
    resolvedShortcuts, availableForShortcut,
  } = useSidebarShortcuts(ALL_TABS, allowedTabs);

  // Command palette items (Cmd+K) → useCommandItems
  const commandItems = useCommandItems(navigateTab);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="admin-mobile-cards min-h-screen bg-gray-50 dark:bg-background" data-admin-shell="true">
      <AdminImpersonationBanner
        visible={isSuperAdminImpersonating}
        tenantName={activeTenantName}
        tenantSlug={activeTenantSlug}
        onExit={handleExitImpersonation}
      />

      {/* Vinculación admin ↔ tienda individual del tenant */}
      <AdminTenantBar tenantSlug={activeTenantSlug} tenantName={activeTenantName} />

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
              <button onClick={() => setEditingShortcuts(!editingShortcuts)} className="text-gray-400 hover:text-primary transition-colors" title="Editar accesos rápidos">
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
                  onClick={() => setShowAddShortcut(!showAddShortcut)}
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
                <button onClick={() => setEditingShortcuts(!editingShortcuts)} className="text-gray-400 hover:text-primary transition-colors" title="Editar accesos rápidos">
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
                    onClick={() => setShowAddShortcut(!showAddShortcut)}
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
      <AdminTopHeader
        presentationMode={presentationMode}
        isSuperAdminImpersonating={isSuperAdminImpersonating}
        focusMode={focusMode}
        userName={userName}
        userRole={userRole}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenCierreDiario={() => setShowCierreDiario(true)}
        onToggleFocus={toggleFocusMode}
        onTogglePresentation={() => setPresentationMode(true)}
        onNavigate={(t) => navigateTab(t as Tab)}
        onLogout={handleLogout}
      />

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
        setClearCategories={(action) => setClearCategories(typeof action === "function" ? action(clearCategories) : action)}
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

      <AdminModuleManagerModal
        open={showModuleManager}
        onClose={() => setShowModuleManager(false)}
        allowedTabs={allowedTabs}
        hiddenTabs={hiddenTabs}
        onToggleHide={toggleHideTab}
        onClearAllHidden={clearAllHiddenTabs}
        visibleCategories={visibleCategories}
        allTabs={ALL_TABS}
        moduleInfo={MODULE_INFO}
        demoModules={DEMO_DATA_MODULES}
        clearedDemoTabs={clearedDemoTabs}
        demoClearing={demoClearing}
        onClearDemoData={clearDemoData}
      />

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

        {/* ── Transición suave al cambiar módulo ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* ── Todos los módulos delegados a TabRouter ── */}
            <TabRouter
              tab={tab}
              storeMode={storeMode}
              onModeChange={setStoreModeState}
              visibleCategories={visibleCategories}
              onSaveCategoryOrder={saveCategoryOrder}
              onboarding={onboarding}
              onNavigateTab={navigateTab}
            />
          </motion.div>
        </AnimatePresence>

      </main>

      <AdminFloatingButtons
        focusMode={focusMode}
        presentationMode={presentationMode}
        onToggleFocus={toggleFocusMode}
        onExitPresentation={() => setPresentationMode(false)}
      />

      {/* Keyboard shortcuts modal — extracted to AdminModals */}
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      <AdminMobileBottomBar
        userRole={userRole}
        currentTab={tab}
        filteredTabs={filteredTabs}
        alerts={alerts}
        onNavigate={navigateTab}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />
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
