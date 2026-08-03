"use client";

/**
 * app/admin/_components/AdminNavigation.tsx
 *
 * Wrapper único que renderiza el `AdminMobileDrawer` + `AdminSidebar`.
 * Ambos componentes comparten casi toda su configuración (tabs, favoritos,
 * shortcuts, alerts, tenant…), así que los agrupamos aquí para reducir
 * prop drilling visible desde la página principal.
 *
 * Extraído de app/admin/page.tsx en el Sprint A final del refactor.
 * No modifica comportamiento.
 *
 * Nota de tipos: `AdminMobileDrawer` y `AdminSidebar` usan shapes
 * estructuralmente compatibles para tabs/shortcuts (todos vienen del
 * mismo `ALL_TABS`), pero con nominal types distintos. Usamos los tipos
 * del drawer como fuente de verdad y casteamos al pasar al sidebar —
 * los valores en runtime son idénticos.
 */

import type { ComponentProps, ComponentType } from "react";
import { AdminMobileDrawer } from "@/components/admin/layout/AdminMobileDrawer";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import type { Tab } from "../_lib/tabs.types";

type DrawerProps = ComponentProps<typeof AdminMobileDrawer>;
type SidebarProps = ComponentProps<typeof AdminSidebar>;

// ── Shapes locales (compatibles con ambos componentes) ─────────────────────
// `id` es `Tab` para items derivados de ALL_TABS y `string` para items de
// shortcuts personalizados. Usamos la unión más laxa para aceptar ambos.
type TabItem = {
  id: Tab | string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};
type ShortcutItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

// ── Grupos de props ────────────────────────────────────────────────────────
export interface AdminNavigationShared {
  activeTenantName: string | null | undefined;
  tab: Tab;
  navigateTab: (tab: Tab) => void;
  filteredTabs: TabItem[];
  allowedTabs: Tab[];
  visibleCategories: SidebarProps["visibleCategories"];
  favoriteTabItems: TabItem[];
  customShortcutItems: TabItem[];
  recentTabItems: TabItem[];
  recentCollapsed: boolean;
  onToggleRecentCollapsed: () => void;
  favoriteTabs: Set<Tab>;
  onToggleFavorite: (tab: Tab) => void;
  resolvedShortcuts: ShortcutItem[];
  editingShortcuts: boolean;
  onToggleEditingShortcuts: () => void;
  showAddShortcut: boolean;
  onToggleShowAddShortcut: () => void;
  availableForShortcut: TabItem[];
  onAddShortcut: (id: string) => void;
  onRemoveShortcut: (id: string) => void;
  onMoveShortcut: (idx: number, dir: 1 | -1) => void;
  clearedDemoTabs: Set<Tab>;
  alerts: Record<string, number>;
}

export interface AdminNavigationDrawer {
  open: boolean;
  onClose: () => void;
  sidebarSearch: string;
  onSidebarSearchChange: (v: string) => void;
  demoDataModules: DrawerProps["demoDataModules"];
  onOpenCierreDiario: () => void;
  onLogout: () => void;
}

export interface AdminNavigationSidebar {
  focusMode: boolean;
  presentationMode: boolean;
  isSuperAdminImpersonating: boolean;
  activeTenantLogo: string | null | undefined;
  activeTenantSlug: string | null | undefined;
  userName: string;
  userRole: string;
  openAccordionCategories: Set<string>;
  onToggleAccordion: (categoryId: string) => void;
  sidebarFlyout: { categoryId: string; top: number } | null;
  onSidebarFlyoutChange: (
    flyout: { categoryId: string; top: number } | null,
  ) => void;
  flyoutTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  hiddenTabs: Set<Tab>;
  allTabs: SidebarProps["allTabs"];
}

export interface AdminNavigationProps {
  shared: AdminNavigationShared;
  drawer: AdminNavigationDrawer;
  sidebar: AdminNavigationSidebar;
}

export function AdminNavigation({
  shared,
  drawer,
  sidebar,
}: AdminNavigationProps) {
  // Cast estructural: el Sidebar usa `React.ElementType` (más ancho) así que
  // acepta los mismos valores sin problema, pero TS no lo deduce por nominal
  // typing. Los cast son seguros porque el runtime es el mismo objeto.
  const sharedAsSidebar = shared as unknown as {
    favoriteTabItems: SidebarProps["favoriteTabItems"];
    customShortcutItems: SidebarProps["customShortcutItems"];
    resolvedShortcuts: SidebarProps["resolvedShortcuts"];
    availableForShortcut: SidebarProps["availableForShortcut"];
  };

  return (
    <>
      <AdminMobileDrawer
        open={drawer.open}
        onClose={drawer.onClose}
        activeTenantName={shared.activeTenantName ?? null}
        tab={shared.tab}
        navigateTab={shared.navigateTab}
        filteredTabs={shared.filteredTabs}
        allowedTabs={shared.allowedTabs}
        visibleCategories={shared.visibleCategories}
        sidebarSearch={drawer.sidebarSearch}
        onSidebarSearchChange={drawer.onSidebarSearchChange}
        favoriteTabItems={shared.favoriteTabItems}
        customShortcutItems={shared.customShortcutItems}
        recentTabItems={shared.recentTabItems}
        recentCollapsed={shared.recentCollapsed}
        onToggleRecentCollapsed={shared.onToggleRecentCollapsed}
        favoriteTabs={shared.favoriteTabs}
        onToggleFavorite={shared.onToggleFavorite}
        resolvedShortcuts={shared.resolvedShortcuts}
        editingShortcuts={shared.editingShortcuts}
        onToggleEditingShortcuts={shared.onToggleEditingShortcuts}
        showAddShortcut={shared.showAddShortcut}
        onToggleShowAddShortcut={shared.onToggleShowAddShortcut}
        availableForShortcut={shared.availableForShortcut}
        onAddShortcut={shared.onAddShortcut}
        onRemoveShortcut={shared.onRemoveShortcut}
        onMoveShortcut={shared.onMoveShortcut}
        alerts={shared.alerts}
        demoDataModules={drawer.demoDataModules}
        clearedDemoTabs={shared.clearedDemoTabs}
        onOpenCierreDiario={drawer.onOpenCierreDiario}
        onLogout={drawer.onLogout}
      />

      <AdminSidebar
        focusMode={sidebar.focusMode}
        presentationMode={sidebar.presentationMode}
        isSuperAdminImpersonating={sidebar.isSuperAdminImpersonating}
        activeTenantName={shared.activeTenantName}
        activeTenantLogo={sidebar.activeTenantLogo}
        activeTenantSlug={sidebar.activeTenantSlug}
        userName={sidebar.userName}
        userRole={sidebar.userRole}
        tab={shared.tab}
        navigateTab={shared.navigateTab}
        allowedTabs={shared.allowedTabs}
        visibleCategories={shared.visibleCategories}
        openAccordionCategories={sidebar.openAccordionCategories}
        onToggleAccordion={sidebar.onToggleAccordion}
        sidebarFlyout={sidebar.sidebarFlyout}
        onSidebarFlyoutChange={sidebar.onSidebarFlyoutChange}
        flyoutTimerRef={sidebar.flyoutTimerRef}
        favoriteTabItems={sharedAsSidebar.favoriteTabItems}
        favoriteTabs={shared.favoriteTabs}
        onToggleFavorite={shared.onToggleFavorite}
        customShortcutItems={sharedAsSidebar.customShortcutItems}
        resolvedShortcuts={sharedAsSidebar.resolvedShortcuts}
        editingShortcuts={shared.editingShortcuts}
        onToggleEditingShortcuts={shared.onToggleEditingShortcuts}
        showAddShortcut={shared.showAddShortcut}
        onToggleShowAddShortcut={shared.onToggleShowAddShortcut}
        availableForShortcut={sharedAsSidebar.availableForShortcut}
        onAddShortcut={shared.onAddShortcut}
        onRemoveShortcut={shared.onRemoveShortcut}
        onMoveShortcut={shared.onMoveShortcut}
        clearedDemoTabs={shared.clearedDemoTabs}
        alerts={shared.alerts}
        hiddenTabs={sidebar.hiddenTabs}
        allTabs={sidebar.allTabs}
      />
    </>
  );
}
