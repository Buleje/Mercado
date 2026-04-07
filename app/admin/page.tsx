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
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import { ShortcutsModal, ClearDataModal } from "@/components/admin/AdminModals";
import type { Tab } from "./_lib/tabs.types";
import { ALL_TABS } from "./_lib/tab-data";
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
import { AdminMobileDrawer } from "@/components/admin/layout/AdminMobileDrawer";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
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
import { useAdminTabsDerived } from "./_hooks/useAdminTabsDerived";

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

  // ALL_TABS → extraído a ./_lib/tab-data.ts (Sprint A del refactor)

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

  // allowedTabs / filteredTabs / favoriteTabItems / recentTabItems
  // → extraídos a ./_hooks/useAdminTabsDerived.ts (Sprint A del refactor)
  const { allowedTabs, filteredTabs, favoriteTabItems, recentTabItems } = useAdminTabsDerived({
    userRole,
    savedRolePerms,
    hiddenTabs,
    selectedCategory,
    visibleCategories,
    sidebarSearch,
    favoriteTabs,
    recentTabs,
    currentTab: tab,
    fuzzyMatch,
  });

  // Custom shortcuts (de SettingsModule) → useCustomShortcuts
  const customShortcutItems = useCustomShortcuts(ALL_TABS);

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

      <AdminMobileDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        activeTenantName={activeTenantName}
        tab={tab}
        navigateTab={navigateTab}
        filteredTabs={filteredTabs}
        allowedTabs={allowedTabs}
        visibleCategories={visibleCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        categoryDropdownOpen={categoryDropdownOpen}
        onToggleCategoryDropdown={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
        favoriteTabItems={favoriteTabItems}
        customShortcutItems={customShortcutItems}
        recentTabItems={recentTabItems}
        recentCollapsed={recentCollapsed}
        onToggleRecentCollapsed={() => setRecentCollapsed(c => !c)}
        favoriteTabs={favoriteTabs}
        onToggleFavorite={toggleFavorite}
        resolvedShortcuts={resolvedShortcuts}
        editingShortcuts={editingShortcuts}
        onToggleEditingShortcuts={() => setEditingShortcuts(!editingShortcuts)}
        showAddShortcut={showAddShortcut}
        onToggleShowAddShortcut={() => setShowAddShortcut(!showAddShortcut)}
        availableForShortcut={availableForShortcut}
        onAddShortcut={addShortcut}
        onRemoveShortcut={removeShortcut}
        onMoveShortcut={moveShortcut}
        alerts={alerts}
        demoDataModules={DEMO_DATA_MODULES}
        clearedDemoTabs={clearedDemoTabs}
        onOpenCierreDiario={() => setShowCierreDiario(true)}
        onLogout={handleLogout}
      />

      <AdminSidebar
        focusMode={focusMode}
        presentationMode={presentationMode}
        isSuperAdminImpersonating={isSuperAdminImpersonating}
        activeTenantName={activeTenantName}
        activeTenantLogo={activeTenantLogo}
        userName={userName}
        userRole={userRole}
        tab={tab}
        navigateTab={navigateTab}
        allowedTabs={allowedTabs}
        filteredTabs={filteredTabs}
        visibleCategories={visibleCategories}
        openAccordionCategories={openAccordionCategories}
        onToggleAccordion={(categoryId) =>
          setOpenAccordionCategories(prev =>
            prev.has(categoryId) ? new Set() : new Set([categoryId])
          )
        }
        sidebarFlyout={sidebarFlyout}
        onSidebarFlyoutChange={setSidebarFlyout}
        flyoutTimerRef={flyoutTimerRef2}
        favoriteTabItems={favoriteTabItems}
        recentTabItems={recentTabItems}
        recentCollapsed={recentCollapsed}
        onToggleRecentCollapsed={() => setRecentCollapsed(c => !c)}
        favoriteTabs={favoriteTabs}
        onToggleFavorite={toggleFavorite}
        customShortcutItems={customShortcutItems}
        resolvedShortcuts={resolvedShortcuts}
        editingShortcuts={editingShortcuts}
        onToggleEditingShortcuts={() => setEditingShortcuts(!editingShortcuts)}
        showAddShortcut={showAddShortcut}
        onToggleShowAddShortcut={() => setShowAddShortcut(!showAddShortcut)}
        availableForShortcut={availableForShortcut}
        onAddShortcut={addShortcut}
        onRemoveShortcut={removeShortcut}
        onMoveShortcut={moveShortcut}
        clearedDemoTabs={clearedDemoTabs}
        alerts={alerts}
        hiddenTabs={hiddenTabs}
        sidebarSearch={sidebarSearch}
        allTabs={ALL_TABS}
      />

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
