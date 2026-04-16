"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { m } from "@/components/admin/providers";
import {
  ShoppingBasket,
  ChevronRight,
  ChevronDown,
  Globe,
  Store,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveSessionStorefrontTarget } from "@/lib/tenant-fetch";
import { useModuleTabs } from "@/contexts/module-tabs-context";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import { MODULE_INFO } from "@/app/admin/_lib/tab-categories";

// ─── Tipos del tab-item que se usa en esta pantalla ───────────────────────────
type TabItem = {
  id: Tab;
  label: string;
  icon: React.ElementType;
};

// Shortcut items: id es string (no Tab) porque vienen de useSidebarShortcuts
type ShortcutItem = {
  id: string;
  label: string;
  icon: React.ElementType;
};

// ─── Props ────────────────────────────────────────────────────────────────────
export type AdminSidebarProps = {
  // Layout state
  focusMode: boolean;
  presentationMode: boolean;
  isSuperAdminImpersonating: boolean;

  // Tenant / usuario
  activeTenantName: string | null | undefined;
  activeTenantLogo: string | null | undefined;
  activeTenantSlug: string | null | undefined;
  userName: string;
  userRole: string;

  // Tab state
  tab: Tab;
  navigateTab: (tab: Tab) => void;
  allowedTabs: Tab[];
  filteredTabs: TabItem[];
  visibleCategories: TabCategory[];

  // Accordion
  openAccordionCategories: Set<string>;
  onToggleAccordion: (categoryId: string) => void;

  // Flyout (sidebar colapsado hover)
  sidebarFlyout: { categoryId: string; top: number } | null;
  onSidebarFlyoutChange: (flyout: { categoryId: string; top: number } | null) => void;
  flyoutTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;

  // Favoritos + recientes
  favoriteTabItems: TabItem[];
  recentTabItems: TabItem[];
  recentCollapsed: boolean;
  onToggleRecentCollapsed: () => void;
  favoriteTabs: Set<Tab>;
  onToggleFavorite: (tab: Tab) => void;

  // Shortcuts personalizados (id: string — compatible con ResolvedShortcut y AllTabsItem)
  customShortcutItems: TabItem[];
  resolvedShortcuts: ShortcutItem[];
  editingShortcuts: boolean;
  onToggleEditingShortcuts: () => void;
  showAddShortcut: boolean;
  onToggleShowAddShortcut: () => void;
  availableForShortcut: ShortcutItem[];
  onAddShortcut: (id: string) => void;
  onRemoveShortcut: (id: string) => void;
  onMoveShortcut: (idx: number, dir: -1 | 1) => void;

  // Demo data + alerts
  clearedDemoTabs: Set<Tab>;
  alerts: Record<string, number>;

  // Tabs ocultos
  hiddenTabs: Set<Tab>;

  // Búsqueda en sidebar
  sidebarSearch: string;

  // Modo fácil / avanzado
  isEasyMode: boolean;
  onToggleAdminMode: () => void;

  // ALL_TABS necesario para resolver el accordion (readonly porque viene de const as const)
  allTabs: readonly TabItem[];
};

// ─── Componente ───────────────────────────────────────────────────────────────
export function AdminSidebar({
  focusMode,
  presentationMode,
  isSuperAdminImpersonating,
  activeTenantName,
  activeTenantLogo,
  activeTenantSlug,
  userName,
  userRole,
  tab,
  navigateTab,
  allowedTabs,
  filteredTabs,
  visibleCategories,
  openAccordionCategories: _openAccordionCategories,
  onToggleAccordion: _onToggleAccordion,
  sidebarFlyout,
  onSidebarFlyoutChange,
  flyoutTimerRef,
  favoriteTabItems: _favoriteTabItems,
  recentTabItems: _recentTabItems,
  recentCollapsed: _recentCollapsed,
  onToggleRecentCollapsed: _onToggleRecentCollapsed,
  favoriteTabs: _favoriteTabs,
  onToggleFavorite: _onToggleFavorite,
  customShortcutItems: _customShortcutItems,
  resolvedShortcuts: _resolvedShortcuts,
  editingShortcuts: _editingShortcuts,
  onToggleEditingShortcuts: _onToggleEditingShortcuts,
  showAddShortcut: _showAddShortcut,
  onToggleShowAddShortcut: _onToggleShowAddShortcut,
  availableForShortcut: _availableForShortcut,
  onAddShortcut: _onAddShortcut,
  onRemoveShortcut: _onRemoveShortcut,
  onMoveShortcut: _onMoveShortcut,
  clearedDemoTabs: _clearedDemoTabs,
  alerts,
  hiddenTabs,
  sidebarSearch,
  isEasyMode,
  onToggleAdminMode,
  allTabs,
}: AdminSidebarProps) {
  const { subTabs: _subTabs, activeSubTab: _activeSubTab } = useModuleTabs();
  const [storeHref, setStoreHref] = React.useState("/marketplace");

  React.useEffect(() => {
    let active = true;

    void resolveSessionStorefrontTarget().then(({ storefrontHref }) => {
      if (active) setStoreHref(storefrontHref);
    });

    return () => {
      active = false;
    };
  }, [activeTenantSlug]);

  // ── Collapsible sections state (persisted in localStorage) ──
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("admin-sidebar-collapsed");
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });

  const toggleSection = React.useCallback((sectionKey: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      try { localStorage.setItem("admin-sidebar-collapsed", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ── Compact mode toggle (persisted in localStorage) ──
  const [isCompact, setIsCompact] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("admin-sidebar-compact") === "true";
    } catch { return false; }
  });

  const toggleCompact = React.useCallback(() => {
    setIsCompact(prev => {
      const next = !prev;
      try { localStorage.setItem("admin-sidebar-compact", next ? "true" : "false"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Effective compact: parent focusMode OR local compact toggle
  const effectiveCompact = focusMode || isCompact;

  // Track which multi-tab categories are expanded (shows sub-tabs)
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(() => {
    // Auto-expand the category containing the active tab
    const activeCat = visibleCategories.find(c => (c.tabs as string[]).includes(tab));
    return activeCat ? new Set([activeCat.id]) : new Set();
  });

  // Auto-expand category when active tab changes
  React.useEffect(() => {
    const activeCat = visibleCategories.find(c => (c.tabs as string[]).includes(tab));
    if (activeCat && !expandedCategories.has(activeCat.id)) {
      setExpandedCategories(prev => new Set([...prev, activeCat.id]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, visibleCategories]);

  // Uniform minimalist icon color — light gray for all categories
  const ICON_COLORS: Record<string, string> = {
    dashboard: "text-gray-400", ventas: "text-gray-400", productos: "text-gray-400",
    inventario: "text-gray-400", compras: "text-gray-400", finanzas: "text-gray-400",
    clientes: "text-gray-400", "marketplace-ops": "text-gray-400", analytics: "text-gray-400",
    comunicacion: "text-gray-400", documentos: "text-gray-400", "mi-tienda": "text-gray-400",
    metas: "text-gray-400",
  };

  // Section headers keyed by the first category id in each group
  const SECTION_BEFORE: Record<string, string> = {
    ventas: "Operaciones",
    finanzas: "Gestión",
    "marketplace-ops": "Canales",
    documentos: "Más",
  };

  return (
    <>
      {/* Desktop permanent sidebar */}
      <aside className={cn(
        "hidden sm:flex fixed left-0 bottom-0 z-40 bg-white dark:bg-card border-r border-gray-100 dark:border-card-border flex-col transition-all duration-300 overflow-hidden",
        effectiveCompact ? "w-16" : "w-[260px]",
        presentationMode && "hidden!",
        isSuperAdminImpersonating ? "top-10" : "top-0"
      )}>
        {/* ── Header: tenant + user ── */}
        <div className={cn(
          "flex items-center gap-3 h-16 border-b border-gray-100 dark:border-card-border transition-all duration-300",
          effectiveCompact ? "px-3 justify-center" : "px-4"
        )}>
          {activeTenantLogo ? (
            <Image
              src={activeTenantLogo}
              alt={activeTenantName ?? "Logo"}
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl object-cover ring-2 ring-gray-100 dark:ring-card-border shrink-0"
            />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShoppingBasket className="h-4.5 w-4.5" />
            </div>
          )}
          {!effectiveCompact && (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 dark:text-foreground text-sm leading-tight truncate">
                {activeTenantName ?? "Mi Bodega"}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-muted leading-tight mt-0.5">
                <span className="capitalize">{userName}</span>
                {" · "}
                <span className="uppercase text-[10px] font-semibold text-blue-500">{userRole}</span>
              </p>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav className={cn(
          "flex-1 overflow-y-auto py-2 transition-all duration-300 scrollbar-hide",
          effectiveCompact ? "px-1.5" : "px-2.5"
        )}>
          {/* ── Main modules (expanded mode) ── */}
          {!effectiveCompact && visibleCategories.map((category, catIdx) => {
            const catTabs = category.tabs.filter(
              t => allowedTabs.includes(t as Tab) && !hiddenTabs.has(t as Tab)
            );
            if (catTabs.length === 0) return null;
            const CategoryIcon = category.icon;
            const isSingleTab = catTabs.length === 1;
            const sectionLabel = SECTION_BEFORE[category.id];
            const iconColor = ICON_COLORS[category.id] ?? "text-gray-400";
            const isSectionCollapsed = collapsedSections.has(sectionLabel ?? "");

            // Determine if this category or any of its tabs is active
            const isActive = isSingleTab
              ? tab === catTabs[0]
              : (catTabs as string[]).includes(tab as string);
            const totalAlerts = catTabs.reduce((sum, t) => sum + (alerts[t] || 0), 0);

            // Resolve display info
            const displayLabel = isSingleTab
              ? (allTabs.find(t => t.id === catTabs[0])?.label ?? category.label)
              : category.label;
            const DisplayIcon = isSingleTab
              ? (allTabs.find(t => t.id === catTabs[0])?.icon ?? CategoryIcon)
              : CategoryIcon;

            return (
              <React.Fragment key={category.id}>
                {/* ── Section header (collapsible) + separator ── */}
                {sectionLabel && (
                  <>
                    {catIdx > 0 && (
                      <div className="my-2 border-t border-gray-100 dark:border-zinc-800" />
                    )}
                    <button
                      onClick={() => toggleSection(sectionLabel)}
                      className="w-full flex items-center gap-1.5 px-3 mt-3 mb-1 group/section"
                    >
                      <ChevronDown className={cn(
                        "h-3 w-3 text-gray-300 dark:text-gray-600 transition-transform duration-200",
                        isSectionCollapsed && "-rotate-90"
                      )} />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-300 dark:text-gray-600 group-hover/section:text-gray-400 dark:group-hover/section:text-gray-500 transition-colors">
                        {sectionLabel}
                      </span>
                    </button>
                  </>
                )}

                {/* ── Category items with grid animation for collapse ── */}
                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-in-out"
                  style={{ gridTemplateRows: (sectionLabel && isSectionCollapsed) ? "0fr" : "1fr" }}
                >
                  <div className="overflow-hidden">
                    <div className="group/cat relative">
                    <button
                      data-tour-tab={isSingleTab ? catTabs[0] : category.id}
                      onClick={() => {
                        if (isSingleTab) {
                          navigateTab(catTabs[0] as Tab);
                        } else {
                          setExpandedCategories(prev => {
                            const next = new Set(prev);
                            if (next.has(category.id)) next.delete(category.id);
                            else next.add(category.id);
                            return next;
                          });
                        }
                      }}
                      className={cn(
                        "group relative w-full flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150 mb-px",
                        "px-3 py-2.5",
                        isActive
                          ? "bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-gray-100 font-semibold"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/40 hover:text-gray-900 dark:hover:text-gray-200"
                      )}
                    >
                      {/* Active indicator bar — 3px left bar with category color */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-emerald-500" />
                      )}

                      <DisplayIcon className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-all duration-200 group-hover:scale-110",
                        isActive ? "text-emerald-600 dark:text-emerald-400" : iconColor
                      )} />

                      <span className="truncate flex-1 text-left">{displayLabel}</span>

                      {totalAlerts > 0 && (
                        <span className="text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-red-500 text-white leading-none animate-pulse">
                          {totalAlerts}
                        </span>
                      )}

                      {!isSingleTab && (
                        <m.div
                          animate={{ rotate: expandedCategories.has(category.id) ? 90 : 0 }}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        >
                          <ChevronRight className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            isActive ? "text-emerald-400" : "text-gray-300 dark:text-gray-600 group-hover:text-gray-400"
                          )} />
                        </m.div>
                      )}
                    </button>

                    {/* Tooltip with tip preview on hover (expanded mode only) */}
                    {(() => {
                      const tipTabId = isSingleTab ? catTabs[0] : catTabs[0];
                      const tipText = MODULE_INFO[tipTabId as Tab]?.tip;
                      if (!tipText) return null;
                      return (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 opacity-0 pointer-events-none group-hover/cat:opacity-100 transition-opacity delay-500 z-50">
                          <div className="relative bg-gray-900 dark:bg-zinc-700 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[200px] leading-relaxed">
                            <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-gray-900 dark:border-r-zinc-700" />
                            {tipText}
                          </div>
                        </div>
                      );
                    })()}
                    </div>

                    {/* Animated sub-tabs for multi-tab categories */}
                    {!isSingleTab && (
                      <div
                        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
                        style={{ gridTemplateRows: expandedCategories.has(category.id) ? "1fr" : "0fr" }}
                      >
                        <div className="overflow-hidden">
                          <div className="ml-4 pl-3 border-l-2 border-gray-100 dark:border-zinc-800 space-y-0.5 py-1">
                            {catTabs.map(subTabId => {
                              const subTabInfo = allTabs.find(t => t.id === subTabId);
                              if (!subTabInfo) return null;
                              const SubIcon = subTabInfo.icon;
                              const isSubActive = tab === subTabId;
                              const subAlertCount = alerts[subTabId] ?? 0;
                              return (
                                <button
                                  key={subTabId}
                                  onClick={() => navigateTab(subTabId as Tab)}
                                  className={cn(
                                    "group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all",
                                    isSubActive
                                      ? "bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-gray-100 font-semibold"
                                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/30 hover:text-gray-700 font-medium"
                                  )}
                                >
                                  {isSubActive && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-emerald-500" />
                                  )}
                                  <SubIcon className={cn(
                                    "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                                    isSubActive ? "text-emerald-500" : "text-gray-400"
                                  )} />
                                  <span className="truncate">{subTabInfo.label}</span>
                                  {subAlertCount > 0 && (
                                    <span className="text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-red-500 text-white leading-none ml-auto animate-pulse">
                                      {subAlertCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/* Flat list when searching */}
          {!effectiveCompact && sidebarSearch && filteredTabs.map(({ id, label, icon: Icon }) => {
            const alertCount = alerts[id] ?? 0;
            return (
              <button
                key={id}
                data-tour-tab={id}
                onClick={() => navigateTab(id)}
                className={cn(
                  "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all mb-px",
                  tab === id
                    ? "bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-gray-100 font-semibold"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                )}
              >
                {tab === id && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-emerald-500" />
                )}
                <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110", tab === id ? "text-emerald-500" : "")} />
                <span className="truncate flex-1 text-left">{label}</span>
                {alertCount > 0 && (
                  <span className="text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-red-500 text-white leading-none animate-pulse">
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Icon-only in compact/focus mode */}
          {effectiveCompact && filteredTabs.map(({ id, label, icon: Icon }) => {
            const alertCount = alerts[id] ?? 0;
            return (
              <div key={id} className="relative group/tip">
                <button
                  data-tour-tab={id}
                  onClick={() => navigateTab(id)}
                  title={label}
                  className={cn(
                    "relative w-full flex items-center justify-center rounded-lg transition-all mb-0.5 px-0 py-2.5",
                    tab === id
                      ? "bg-gray-50 dark:bg-zinc-800/50 text-emerald-600"
                      : "text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/40 hover:text-gray-600"
                  )}
                >
                  {tab === id && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-emerald-500" />}
                  <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover/tip:scale-110" />
                  {alertCount > 0 && (
                    <span className="absolute top-1 right-1 text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center bg-red-500 text-white leading-none animate-pulse">
                      {alertCount > 9 ? "9+" : alertCount}
                    </span>
                  )}
                </button>
                {/* Tooltip on hover in compact mode */}
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 dark:bg-zinc-700 text-white text-xs rounded shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50">
                  {label}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── Footer: mode toggle + external links + compact toggle ── */}
        <div className={cn(
          "py-3 border-t border-gray-100 dark:border-card-border space-y-0.5 transition-all duration-300",
          effectiveCompact ? "px-1.5" : "px-2.5"
        )}>
          {/* Easy / Advanced mode toggle */}
          {!effectiveCompact && (
            <button
              onClick={onToggleAdminMode}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/40 group"
            >
              <div className={cn(
                "relative h-5 w-9 rounded-full transition-colors shrink-0",
                isEasyMode ? "bg-primary" : "bg-blue-500"
              )}>
                <div className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  isEasyMode ? "left-0.5" : "left-[18px]"
                )} />
              </div>
              <span className="truncate">
                {isEasyMode ? "Modo Fácil" : "Avanzado"}
              </span>
            </button>
          )}
          {effectiveCompact && (
            <button
              onClick={onToggleAdminMode}
              title={isEasyMode ? "Modo Fácil — click para Avanzado" : "Modo Avanzado — click para Fácil"}
              className="relative w-full flex items-center justify-center rounded-lg transition-all mb-0.5 px-0 py-2.5 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/40 hover:text-gray-600"
            >
              <div className={cn(
                "h-5 w-9 rounded-full transition-colors",
                isEasyMode ? "bg-primary" : "bg-blue-500"
              )}>
                <div className={cn(
                  "absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  isEasyMode ? "left-[calc(50%-14px)]" : "left-[calc(50%+2px)]"
                )} />
              </div>
            </button>
          )}
          <Link
            href="/marketplace"
            target="_blank"
            title={effectiveCompact ? "Marketplace" : undefined}
            className={cn(
              "flex items-center rounded-lg text-[13px] font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all",
              effectiveCompact ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
            )}
          >
            <Globe className="h-[18px] w-[18px] shrink-0" /> {!effectiveCompact && "Marketplace"}
          </Link>
          <Link
            href={storeHref}
            target="_blank"
            rel="noopener noreferrer"
            title={effectiveCompact ? "Mi Tienda" : undefined}
            className={cn(
              "flex items-center rounded-lg text-[13px] font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all",
              effectiveCompact ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
            )}
          >
            <Store className="h-[18px] w-[18px] shrink-0" /> {!effectiveCompact && "Mi Tienda"}
          </Link>

          {/* ── Compact mode toggle ── */}
          {!focusMode && (
            <>
              <div className="my-1.5 border-t border-gray-100 dark:border-zinc-800" />
              <button
                onClick={toggleCompact}
                title={isCompact ? "Expandir sidebar" : "Compactar sidebar"}
                className={cn(
                  "flex items-center rounded-lg text-[13px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-all",
                  effectiveCompact ? "justify-center w-full px-0 py-2.5" : "gap-3 px-3 py-2.5 w-full"
                )}
              >
                {isCompact ? (
                  <PanelLeft className="h-[18px] w-[18px] shrink-0" />
                ) : (
                  <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
                )}
                {!effectiveCompact && (
                  <span className="truncate">{isCompact ? "Expandir" : "Compactar"}</span>
                )}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Sidebar category flyout panel — only for multi-tab categories */}
      {!effectiveCompact && sidebarFlyout && (() => {
        const cat = visibleCategories.find(c => c.id === sidebarFlyout.categoryId);
        if (!cat) return null;
        const catTabs = cat.tabs.filter(t => allowedTabs.includes(t as Tab));
        if (catTabs.length <= 1) return null;
        return (
          <m.div
            key={sidebarFlyout.categoryId}
            initial={{ opacity: 0, x: -8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", top: sidebarFlyout.top, left: 264, zIndex: 50 }}
            onMouseEnter={() => { if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current); }}
            onMouseLeave={() => { flyoutTimerRef.current = setTimeout(() => onSidebarFlyoutChange(null), 150); }}
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-2xl py-2 w-60 max-h-[80vh] overflow-y-auto"
          >
            {catTabs.map(tabId => {
              const tabInfo = allTabs.find(t => t.id === tabId);
              if (!tabInfo) return null;
              const FlyoutTabIcon = tabInfo.icon;
              return (
                <button
                  key={tabId}
                  onClick={() => { navigateTab(tabId as Tab); onSidebarFlyoutChange(null); }}
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
          </m.div>
        );
      })()}
    </>
  );
}
