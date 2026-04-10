"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useNotifications } from "@/hooks/use-notifications";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTokenRefresh } from "@/hooks/use-token-refresh";
import { Loader2 } from "lucide-react";
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

  const { toggle: toggleTheme } = useTheme();
  const { permission, requestPermission, sendNotification, hasAsked } = useNotifications();
  const _webhookPendingCount = useWebhookPendingCount(userRole);
  void _webhookPendingCount;

  useAdminNavigateEvent(navigateTab);
  useDocumentTitle(tab, activeTenantName);
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

      <AdminTenantBar tenantSlug={activeTenantSlug} tenantName={activeTenantName} />

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
          focusMode, presentationMode, isSuperAdminImpersonating,
          activeTenantLogo, userName, userRole, openAccordionCategories,
          onToggleAccordion: (categoryId) =>
            setOpenAccordionCategories(prev =>
              prev.has(categoryId) ? new Set() : new Set([categoryId])
            ),
          sidebarFlyout, onSidebarFlyoutChange: setSidebarFlyout, flyoutTimerRef,
          hiddenTabs, sidebarSearch, allTabs: ALL_TABS,
        }}
      />

      <div className={cn(
        "flex flex-col min-h-screen transition-[margin] duration-300",
        presentationMode ? "sm:ml-0" : focusMode ? "sm:ml-16" : "sm:ml-64",
      )}>
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
  );
}

// Export as client-only (no SSR) to prevent hydration mismatches.
const AdminPageNoSSR = dynamic(
  () => Promise.resolve({ default: AdminPage }),
  { ssr: false },
);
export default AdminPageNoSSR;
