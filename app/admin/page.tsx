"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useNotifications } from "@/hooks/use-notifications";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTokenRefresh } from "@/hooks/use-token-refresh";
import { useAdminPrefetch } from "@/hooks/use-admin-prefetch";
import { useTenantCacheGuard } from "@/hooks/use-tenant-cache-guard";
import { LoadingState } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/theme-context";
import type { Tab } from "./_lib/tabs.types";
import { ALL_TABS } from "./_lib/tab-data";
import { DEMO_DATA_MODULES, MODULE_INFO, TAB_CATEGORIES } from "./_lib/tab-categories";

import {
  useAdminTabs, useAdminModals, useKeyboardShortcuts, useAdminLayout,
  useFavoritesAndRecent, useImpersonation, useDemoCleanup, useAdminAuth,
  useWebhookPendingCount, useChangelogBadge, useHiddenTabs, useCategoryOrder,
  useOnboardingTrigger, useAdminAlerts, useNewOrderNotification,
  useNotificationPermissionPrompt, useMobileTableCards, useOnboardingTourTrigger,
  useDocumentTitle, useSwipeNavigation, useAdminNavigateEvent, useSidebarShortcuts,
  useClearDataFlow, useCustomShortcuts, useCommandItems, useAdminTabsDerived,
  useAdminPageState, useAdminTenantPath, useFuzzyMatch, useVisibleCategories,
} from "./_hooks";

import { AdminImpersonationBanner } from "@/components/admin/AdminImpersonationBanner";
import { AdminTenantBar } from "@/components/admin/AdminTenantBar";
import { AdminTopHeader } from "@/components/admin/AdminTopHeader";
import { TrialCountdownBannerLoader } from "@/components/admin/billing/TrialCountdownBannerLoader";
import { TrialExpiredGuard } from "@/components/admin/billing/TrialExpiredGuard";
import AdminAlertsBanner from "@/components/admin/AdminAlertsBanner";
import { AdminNavigation } from "./_components/AdminNavigation";
import { AdminMainContent } from "./_components/AdminMainContent";

// ── Deferred chrome (sessions 4-7) ─────────────────────────────────────────────
// AdminCommandPalette, AdminGlobalModals and AdminOverlaysLayer are not on the
// critical first-paint path. They are only visible on explicit user actions
// (Ctrl+K, opening a modal, activating presentation/onboarding). Loading them
// via next/dynamic removes their code from the initial admin chunk.
// TASK-003 — companion tab wrappers live in @/components/admin/tabs/*.
const AdminCommandPalette = dynamic(
  () => import("@/components/admin/shared/AdminCommandPalette"),
  { loading: () => null, ssr: false },
);
const AdminGlobalModals = dynamic(
  () =>
    import("./_components/AdminGlobalModals").then((mod) => ({
      default: mod.AdminGlobalModals,
    })),
  { loading: () => null, ssr: false },
);
const AdminOverlaysLayer = dynamic(
  () =>
    import("./_components/AdminOverlaysLayer").then((mod) => ({
      default: mod.AdminOverlaysLayer,
    })),
  { loading: () => null, ssr: false },
);

function AdminPage() {
  const router = useRouter();
  const { handleLogout, onUnauth } = useAdminTenantPath(router);

  useTokenRefresh();
  const onboarding = useOnboarding();

  const {
    mobileNavOpen, setMobileNavOpen,
    compactMode, focusMode, toggleFocusMode,
    presentationMode, setPresentationMode,
  } = useAdminLayout();

  const {
    selectedCategory, setSelectedCategory,
    categoryDropdownOpen, setCategoryDropdownOpen,
    sidebarSearch, setShowModuleHelp,
    recentCollapsed, setRecentCollapsed,
    openAccordionCategories, setOpenAccordionCategories,
    sidebarFlyout, setSidebarFlyout, flyoutTimerRef,
  } = useAdminPageState();

  const { favoriteTabs, toggleFavorite, recentTabs, addRecent } = useFavoritesAndRecent();
  const { tab, navigateTab } = useAdminTabs(addRecent);

  // [SEGURIDAD MULTI-TENANT] Antes de cualquier prefetch o lectura de cache,
  // verificar que el cache pertenezca al tenant actual. Si el superadmin entra
  // a otro tenant (impersonate), el localStorage es compartido entre pestañas
  // del mismo origen y filtraría datos. assertTenantOwnership() compara la
  // cookie active-tenant-slug con el owner cacheado y limpia todo si cambia.
  useTenantCacheGuard();

  // Prefetch global de APIs admin más usadas (products, suppliers, customers,
  // sales, dashboard, goals) en background al montar. Resultado: cualquier
  // sub-tab que el usuario abra después tiene los datos en localStorage —
  // hidratación instantánea en lugar de esperar 5-7s al cold compile.
  useAdminPrefetch();

  const {
    showShortcuts, setShowShortcuts,
    searchOpen, setSearchOpen,
    showModuleManager, setShowModuleManager,
    showCierreDiario, setShowCierreDiario,
    showChangelog, setShowChangelog,
  } = useAdminModals();

  const {
    showClearConfirm, setShowClearConfirm,
    clearConfirmStep, setClearConfirmStep,
    clearConfirmText, setClearConfirmText,
    clearingData, setClearingData,
    clearCategories, setClearCategories,
  } = useClearDataFlow();

  const { hiddenTabs, toggleHideTab, clearAllHiddenTabs } = useHiddenTabs();
  const { clearedDemoTabs, demoClearing, clearDemoData } = useDemoCleanup(DEMO_DATA_MODULES);
  const { categoryOrder, saveCategoryOrder } = useCategoryOrder();
  const { showOnboarding, setShowOnboarding } = useOnboardingTrigger();

  // changelogHasNew / webhookPendingCount: se mantienen para reactivar badges
  const _changelogHasNew = useChangelogBadge();
  void _changelogHasNew;

  // Cierra panel "module help" inline cuando cambia la tab activa
  useEffect(() => { setShowModuleHelp(false); }, [tab, setShowModuleHelp]);

  const {
    userRole, userName, authReady, savedRolePerms,
    storeMode, setStoreModeState,
  } = useAdminAuth(onUnauth);

  const {
    isSuperAdminImpersonating, activeTenantName, activeTenantSlug,
    activeTenantLogo, handleExit: handleExitImpersonation,
  } = useImpersonation();

  const { toggle: toggleTheme, resolved: resolvedTheme, theme: themeMode, setTheme } = useTheme();
  const { permission, requestPermission, sendNotification, hasAsked } = useNotifications();
  const _webhookPendingCount = useWebhookPendingCount(userRole, authReady);
  void _webhookPendingCount;

  useAdminNavigateEvent(navigateTab);
  useDocumentTitle(tab, activeTenantName);

  // Compact sidebar state propagado via localStorage — AdminSidebar lo toggle.
  // Aca lo leemos para ajustar el margin del main content en coherencia.
  const [sidebarCompact, setSidebarCompact] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("admin-sidebar-compact") === "true"; } catch { return false; }
  });
  // Config mode: cuando editando barra lateral, sidebar se expande a 400px
  const [sidebarConfigMode, setSidebarConfigMode] = useState<boolean>(false);
  useEffect(() => {
    const syncFromStorage = () => {
      try { setSidebarCompact(localStorage.getItem("admin-sidebar-compact") === "true"); } catch { /* ignore */ }
    };
    const syncFromEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ compact: boolean }>).detail;
      if (detail && typeof detail.compact === "boolean") setSidebarCompact(detail.compact);
    };
    const syncConfigMode = (e: Event) => {
      const detail = (e as CustomEvent<{ configMode: boolean }>).detail;
      if (detail && typeof detail.configMode === "boolean") setSidebarConfigMode(detail.configMode);
    };
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("admin-sidebar-compact-change", syncFromEvent);
    window.addEventListener("admin-sidebar-config-change", syncConfigMode);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("admin-sidebar-compact-change", syncFromEvent);
      window.removeEventListener("admin-sidebar-config-change", syncConfigMode);
    };
  }, []);
  const swipeHandlers = useSwipeNavigation(tab, navigateTab, TAB_CATEGORIES);
  useOnboardingTourTrigger(onboarding);

  const fuzzyMatch = useFuzzyMatch();
  const { alerts, quickStats } = useAdminAlerts(authReady);

  useNewOrderNotification(quickStats, permission, sendNotification);
  useNotificationPermissionPrompt(authReady, hasAsked, permission, requestPermission);
  useMobileTableCards(authReady, tab);

  useKeyboardShortcuts({
    navigateTab, toggleTheme, handleLogout,
    setSearchOpen, setShowShortcuts, setShowCierreDiario, setPresentationMode,
  });

  const visibleCategories = useVisibleCategories(categoryOrder);

  const { allowedTabs, filteredTabs, favoriteTabItems, recentTabItems } = useAdminTabsDerived({
    userRole, savedRolePerms, hiddenTabs, selectedCategory, visibleCategories,
    sidebarSearch, favoriteTabs, recentTabs, currentTab: tab, fuzzyMatch,
  });

  const customShortcutItems = useCustomShortcuts(ALL_TABS);

  const {
    editingShortcuts, setEditingShortcuts,
    showAddShortcut, setShowAddShortcut,
    removeShortcut, addShortcut, moveShortcut,
    resolvedShortcuts, availableForShortcut,
  } = useSidebarShortcuts(ALL_TABS, allowedTabs);

  const commandItems = useCommandItems(navigateTab);

  // Find active category based on current tab — drives the sub-sidebar
  const activeCategory = visibleCategories.find(cat => cat.tabs.includes(tab));
  const hasSubSidebar = !focusMode && !presentationMode && activeCategory && activeCategory.tabs.length > 1;
  const subSidebarTabs = hasSubSidebar
    ? activeCategory.tabs
        .map(tabId => ALL_TABS.find(t => t.id === tabId))
        .filter(Boolean)
        .map(t => ({ id: t!.id, label: t!.label, icon: t!.icon }))
    : [];
  const [subSidebarMobileOpen, setSubSidebarMobileOpen] = React.useState(false);

  // Sub-tabs now render inline inside the main sidebar — no more collapsing
  const effectiveFocusMode = focusMode;
  const mainSidebarWidth = effectiveFocusMode ? 64 : 260; // px

  // Keyboard: Arrow Up/Down navigate sub-tabs, Escape closes sub-sidebar
  React.useEffect(() => {
    if (!hasSubSidebar || subSidebarTabs.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = subSidebarTabs.findIndex(t => t.id === tab);
      if (e.key === "ArrowDown" && e.altKey && idx < subSidebarTabs.length - 1) {
        e.preventDefault();
        navigateTab(subSidebarTabs[idx + 1].id as Tab);
      } else if (e.key === "ArrowUp" && e.altKey && idx > 0) {
        e.preventDefault();
        navigateTab(subSidebarTabs[idx - 1].id as Tab);
      } else if (e.key === "Escape" && hasSubSidebar) {
        navigateTab("asistente-ia" as Tab);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasSubSidebar, subSidebarTabs, tab, navigateTab]);

  if (!authReady) {
    return <LoadingState variant="fullscreen" message="" />;
  }

  return (
    <TrialExpiredGuard>
    <div className="admin-mobile-cards min-h-screen bg-gray-50 dark:bg-[var(--surface-canvas)]" data-admin-shell="true" data-dark-fallback>
      {/* ADR-084: cuenta regresiva del trial — visible solo si plan=free + trial activo */}
      <TrialCountdownBannerLoader />

      {/* ADR-087: alertas operativas (solicitudes pendientes, pedidos sin partner) */}
      <AdminAlertsBanner />

      {/* AdminImpersonationBanner removido — el chip tenant del topbar
          ya indica el negocio administrado. Salir de impersonation se
          hace desde el menu de usuario. */}

      {/* AdminTenantBar removido — el chip tenant ahora vive dentro del
          AdminTopHeader al lado de la busqueda global (mas compacto). */}

      <AdminNavigation
        shared={{
          activeTenantName, tab, navigateTab, filteredTabs, allowedTabs,
          visibleCategories, favoriteTabItems, customShortcutItems, recentTabItems,
          recentCollapsed, onToggleRecentCollapsed: () => setRecentCollapsed(c => !c),
          favoriteTabs, onToggleFavorite: toggleFavorite,
          resolvedShortcuts, editingShortcuts,
          onToggleEditingShortcuts: () => setEditingShortcuts(!editingShortcuts),
          showAddShortcut, onToggleShowAddShortcut: () => setShowAddShortcut(!showAddShortcut),
          availableForShortcut, onAddShortcut: addShortcut,
          onRemoveShortcut: removeShortcut, onMoveShortcut: moveShortcut,
          clearedDemoTabs, alerts,
        }}
        drawer={{
          open: mobileNavOpen,
          onClose: () => setMobileNavOpen(false),
          selectedCategory, onSelectCategory: setSelectedCategory,
          categoryDropdownOpen,
          onToggleCategoryDropdown: () => setCategoryDropdownOpen(!categoryDropdownOpen),
          demoDataModules: DEMO_DATA_MODULES,
          onOpenCierreDiario: () => setShowCierreDiario(true),
          onLogout: handleLogout,
        }}
        sidebar={{
          focusMode: effectiveFocusMode, presentationMode, isSuperAdminImpersonating,
          activeTenantLogo, activeTenantSlug, userName, userRole, openAccordionCategories,
          onToggleAccordion: (categoryId) =>
            setOpenAccordionCategories(prev =>
              prev.has(categoryId) ? new Set() : new Set([categoryId])
            ),
          sidebarFlyout, onSidebarFlyoutChange: setSidebarFlyout, flyoutTimerRef,
          hiddenTabs, sidebarSearch, allTabs: ALL_TABS,
        }}
      />

      <div
        data-dark-fallback
        className={cn(
        "flex flex-col min-h-screen transition-[margin] duration-[var(--dur-base)]",
        presentationMode ? "sm:ml-0"
          : focusMode ? "sm:ml-16"
          : sidebarCompact ? "sm:ml-[60px]"
          /* configMode: sidebar (260px) + config panel (400px) = 660px */
          : sidebarConfigMode ? "sm:ml-[660px]"
          : "sm:ml-[260px]",
      )}>
        <AdminTopHeader
          presentationMode={presentationMode}
          isSuperAdminImpersonating={isSuperAdminImpersonating}
          focusMode={focusMode}
          resolvedTheme={resolvedTheme}
          themeMode={themeMode}
          userName={userName}
          userRole={userRole}
          tenantSlug={activeTenantSlug}
          tenantName={activeTenantName}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenCierreDiario={() => setShowCierreDiario(true)}
          onToggleFocus={toggleFocusMode}
          onTogglePresentation={() => setPresentationMode(true)}
          onToggleTheme={toggleTheme}
          onSetTheme={setTheme}
          onNavigate={(t) => navigateTab(t as Tab)}
          onLogout={handleLogout}
        />

        {/* Breadcrumb removed — already shown in module headers */}

        <AdminCommandPalette items={commandItems} />

        <AdminGlobalModals
          clearData={{
            show: showClearConfirm, setShow: setShowClearConfirm,
            step: clearConfirmStep, setStep: setClearConfirmStep,
            text: clearConfirmText, setText: setClearConfirmText,
            categories: clearCategories, setCategories: setClearCategories,
            clearing: clearingData, setClearing: setClearingData,
            demoDataModuleKeys: Object.keys(DEMO_DATA_MODULES),
          }}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          navigateTab={navigateTab}
          showCierreDiario={showCierreDiario}
          setShowCierreDiario={setShowCierreDiario}
          showChangelog={showChangelog}
          setShowChangelog={setShowChangelog}
          showModuleManager={showModuleManager}
          setShowModuleManager={setShowModuleManager}
          moduleManager={{
            allowedTabs, hiddenTabs,
            onToggleHide: toggleHideTab, onClearAllHidden: clearAllHiddenTabs,
            visibleCategories, allTabs: ALL_TABS, moduleInfo: MODULE_INFO,
            demoModules: DEMO_DATA_MODULES, clearedDemoTabs, demoClearing,
            onClearDemoData: clearDemoData,
          }}
        />

        {/* AdminKPIBanner removido 2026-04-18 — se mostraba en cada módulo
            y el dueño lo encontraba repetitivo. El banner sigue disponible en
            components/admin/AdminKPIBanner.tsx si se quiere usar en un tab
            específico (p. ej. solo en "Inicio"), no globalmente. */}

        <AdminMainContent
          tab={tab}
          navigateTab={navigateTab}
          compactMode={compactMode}
          presentationMode={presentationMode}
          swipeHandlers={swipeHandlers}
          tabRouter={{
            storeMode, onModeChange: setStoreModeState, visibleCategories,
            onSaveCategoryOrder: saveCategoryOrder, onboarding,
          }}
        />

        <AdminOverlaysLayer
          focusMode={focusMode}
          presentationMode={presentationMode}
          onToggleFocus={toggleFocusMode}
          onExitPresentation={() => setPresentationMode(false)}
          showShortcuts={showShortcuts}
          onCloseShortcuts={() => setShowShortcuts(false)}
          userRole={userRole}
          tab={tab}
          filteredTabs={filteredTabs}
          alerts={alerts}
          navigateTab={navigateTab}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          showOnboarding={showOnboarding}
          setShowOnboarding={setShowOnboarding}
          activeTenantSlug={activeTenantSlug}
          onboarding={onboarding}
        />
      </div>
    </div>
    </TrialExpiredGuard>
  );
}

// Export as client-only (no SSR) to prevent hydration mismatches.
const AdminPageNoSSR = dynamic(
  () => Promise.resolve({ default: AdminPage }),
  { ssr: false },
);
export default AdminPageNoSSR;
