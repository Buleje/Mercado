"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  ShoppingBasket,
  Clock,
  ChevronDown,
  ChevronUp,
  Zap,
  Check,
  X,
  Globe,
  Store,
  Pencil,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import { DEMO_DATA_MODULES } from "@/app/admin/_lib/tab-categories";

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
  userName,
  userRole,
  tab,
  navigateTab,
  allowedTabs,
  filteredTabs,
  visibleCategories,
  openAccordionCategories,
  onToggleAccordion,
  sidebarFlyout,
  onSidebarFlyoutChange,
  flyoutTimerRef,
  favoriteTabItems,
  recentTabItems,
  recentCollapsed,
  onToggleRecentCollapsed,
  favoriteTabs,
  onToggleFavorite,
  customShortcutItems,
  resolvedShortcuts,
  editingShortcuts,
  onToggleEditingShortcuts,
  showAddShortcut,
  onToggleShowAddShortcut,
  availableForShortcut,
  onAddShortcut,
  onRemoveShortcut,
  onMoveShortcut,
  clearedDemoTabs,
  alerts,
  hiddenTabs,
  sidebarSearch,
  allTabs,
}: AdminSidebarProps) {
  return (
    <>
      {/* Desktop permanent sidebar */}
      <aside className={cn(
        "hidden sm:flex fixed left-0 bottom-0 z-40 bg-white dark:bg-card border-r border-gray-200 dark:border-card-border flex-col transition-all duration-300 overflow-hidden",
        focusMode ? "w-16" : "w-64",
        presentationMode && "hidden!",
        isSuperAdminImpersonating ? "top-10" : "top-0"
      )}>
        <div className={cn(
          "flex items-center gap-3 py-5 border-b border-gray-200 dark:border-card-border bg-primary/5 transition-all duration-300",
          focusMode ? "px-3 justify-center" : "px-5"
        )}>
          {activeTenantLogo ? (
            <img
              src={activeTenantLogo}
              alt={activeTenantName ?? "Logo"}
              className="h-9 w-9 rounded-xl object-cover shadow-sm shrink-0"
            />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm shrink-0">
              <ShoppingBasket className="h-5 w-5" />
            </div>
          )}
          {!focusMode && (
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-gray-900 dark:text-foreground text-sm leading-tight">
                {activeTenantName ?? "Mi Bodega"}
              </p>
              <p className="text-xs text-gray-400 dark:text-muted">
                <span className="capitalize">{userName}</span>
                {" · "}
                <span className="uppercase text-[10px] font-bold text-primary">{userRole}</span>
              </p>
            </div>
          )}
        </div>

        <nav className={cn(
          "flex-1 overflow-y-auto py-3 transition-all duration-300",
          focusMode ? "px-1" : "px-3"
        )}>
          {/* Favorite tabs section — hidden in focus mode */}
          {!focusMode && (favoriteTabItems.length > 0 || customShortcutItems.length > 0) && (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1">
                <Star className="h-3 w-3" /> Favoritos
              </p>
              {favoriteTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`fav-${id}`}
                  onClick={() => navigateTab(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id
                      ? "bg-primary text-white shadow-sm"
                      : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
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
                    tab === id
                      ? "bg-primary text-white shadow-sm"
                      : "text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-accent"
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
              <button
                onClick={onToggleRecentCollapsed}
                className="w-full text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted px-4 mb-1 flex items-center gap-1 hover:text-gray-600 dark:hover:text-foreground transition-colors"
              >
                <Clock className="h-3 w-3" /> Recientes
                {recentCollapsed
                  ? <ChevronDown className="h-3 w-3 ml-auto" />
                  : <ChevronUp className="h-3 w-3 ml-auto" />
                }
              </button>
              {!recentCollapsed && recentTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`rec-${id}`}
                  onClick={() => navigateTab(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id
                      ? "bg-primary text-white shadow-sm"
                      : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
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
            const catTabs = category.tabs.filter(
              t => allowedTabs.includes(t as Tab) && !hiddenTabs.has(t as Tab)
            );
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
                      onToggleAccordion(category.id);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (isSingleTab) return;
                    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onSidebarFlyoutChange({ categoryId: category.id, top: rect.top });
                  }}
                  onMouseLeave={() => {
                    if (!isSingleTab) {
                      flyoutTimerRef.current = setTimeout(() => onSidebarFlyoutChange(null), 150);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <CategoryIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{category.label}</span>
                  {!isSingleTab && (
                    <>
                      <span className="text-[10px] font-bold text-gray-400 dark:text-muted tabular-nums">
                        {catTabs.length}
                      </span>
                      <ChevronDown className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-gray-400",
                        isOpen && "rotate-180"
                      )} />
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
                          const tabInfo = allTabs.find(t => t.id === tabId);
                          if (!tabInfo) return null;
                          const TabIcon = tabInfo.icon;
                          return (
                            <button
                              key={tabId}
                              data-tour-tab={tabId}
                              onClick={() => navigateTab(tabId as Tab)}
                              className={cn(
                                "group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all mb-0.5",
                                tab === tabId
                                  ? "bg-primary text-white shadow-sm"
                                  : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                              )}
                            >
                              <TabIcon className="h-4 w-4 shrink-0" />
                              <span className="truncate flex-1 text-left">{tabInfo.label}</span>
                              {DEMO_DATA_MODULES[tabId as Tab] && !clearedDemoTabs.has(tabId as Tab) && (
                                <span
                                  title="Datos de ejemplo"
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full shrink-0",
                                    tab === tabId ? "bg-red-300" : "bg-red-500"
                                  )}
                                />
                              )}
                              {alerts[tabId] && (
                                <span className={cn(
                                  "text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center",
                                  tab === tabId ? "bg-white/20 text-white" : "bg-red-500 text-white"
                                )}>
                                  {alerts[tabId]}
                                </span>
                              )}
                              <Star
                                onClick={e => { e.stopPropagation(); onToggleFavorite(tabId as Tab); }}
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 transition-all cursor-pointer",
                                  favoriteTabs.has(tabId as Tab)
                                    ? "fill-amber-400 text-amber-400"
                                    : "opacity-0 group-hover:opacity-60 text-gray-400"
                                )}
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
                tab === id
                  ? "bg-primary text-white shadow-sm"
                  : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate flex-1 text-left">{label}</span>
              {DEMO_DATA_MODULES[id] && !clearedDemoTabs.has(id) && (
                <span
                  title="Datos de ejemplo"
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    tab === id ? "bg-red-300" : "bg-red-500"
                  )}
                />
              )}
              {alerts[id] && (
                <span className={cn(
                  "text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center",
                  tab === id ? "bg-white/20 text-white" : "bg-red-500 text-white"
                )}>
                  {alerts[id]}
                </span>
              )}
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
                tab === id
                  ? "bg-primary text-white shadow-sm"
                  : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
            </button>
          ))}
        </nav>

        {/* Footer: shortcuts + links + logout */}
        <div className={cn(
          "py-4 border-t border-gray-200 dark:border-card-border space-y-1 transition-all duration-300",
          focusMode ? "px-1" : "px-3"
        )}>
          {/* Quick access shortcuts — expanded mode */}
          {!focusMode && (
            <div className="mb-2 space-y-0.5">
              <div className="flex items-center justify-between px-4 mb-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Accesos rápidos
                </p>
                <button
                  onClick={onToggleEditingShortcuts}
                  className="text-gray-400 hover:text-primary transition-colors"
                  title="Editar accesos rápidos"
                >
                  {editingShortcuts
                    ? <Check className="h-3 w-3 text-primary" />
                    : <Pencil className="h-3 w-3" />
                  }
                </button>
              </div>
              {resolvedShortcuts.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-1">
                  {editingShortcuts && (
                    <div className="flex flex-col -mr-1">
                      <button
                        onClick={() => onMoveShortcut(idx, -1)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-primary disabled:opacity-20 p-0 leading-none"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onMoveShortcut(idx, 1)}
                        disabled={idx === resolvedShortcuts.length - 1}
                        className="text-gray-400 hover:text-primary disabled:opacity-20 p-0 leading-none"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => { if (!editingShortcuts) navigateTab(s.id as Tab); /* id is a valid Tab */ }}
                    className={cn(
                      "flex-1 flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                      tab === s.id
                        ? "bg-primary/10 text-primary"
                        : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                    )}
                  >
                    <s.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{s.label}</span>
                    {!editingShortcuts && alerts[s.id] && (
                      <span className="ml-auto text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center bg-red-500 text-white">
                        {alerts[s.id]}
                      </span>
                    )}
                  </button>
                  {editingShortcuts && (
                    <button
                      onClick={() => onRemoveShortcut(s.id)}
                      className="p-1 text-red-400 hover:text-red-600 transition-colors"
                      title="Quitar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {editingShortcuts && (
                <div className="relative">
                  <button
                    onClick={onToggleShowAddShortcut}
                    className="w-full flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-medium text-primary/70 hover:bg-primary/5 transition-all border border-dashed border-primary/30"
                  >
                    <Plus className="h-4 w-4" /> Agregar acceso
                  </button>
                  {showAddShortcut && (
                    <div className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {availableForShortcut.map(t => (
                        <button
                          key={t.id}
                          onClick={() => onAddShortcut(t.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                        >
                          <t.icon className="h-4 w-4 shrink-0" /> {t.label}
                        </button>
                      ))}
                      {availableForShortcut.length === 0 && (
                        <p className="px-3 py-2 text-xs text-gray-400">Ya están todos agregados</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quick access shortcuts — focus (icon-only) mode */}
          {focusMode && (
            <div className="mb-2 space-y-0.5">
              {resolvedShortcuts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigateTab(s.id as Tab)}
                  title={s.label}
                  className={cn(
                    "w-full flex items-center justify-center rounded-xl text-sm font-semibold transition-all px-0 py-2",
                    tab === s.id
                      ? "bg-primary text-white shadow-sm"
                      : "text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <s.icon className="h-4.5 w-4.5 shrink-0" />
                </button>
              ))}
            </div>
          )}

          <Link
            href="/marketplace"
            target="_blank"
            title={focusMode ? "Marketplace" : undefined}
            className={cn(
              "flex items-center rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-all",
              focusMode ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-3"
            )}
          >
            <Globe className="h-5 w-5" /> {!focusMode && "Marketplace"}
          </Link>
          <Link
            href="/tienda"
            target="_blank"
            title={focusMode ? "Tienda" : undefined}
            className={cn(
              "flex items-center rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-all",
              focusMode ? "justify-center px-0 py-2.5" : "gap-3 px-4 py-3"
            )}
          >
            <Store className="h-5 w-5" /> {!focusMode && "Tienda"}
          </Link>
        </div>
      </aside>

      {/* Sidebar category flyout panel — only for multi-tab categories */}
      {!focusMode && sidebarFlyout && (() => {
        const cat = visibleCategories.find(c => c.id === sidebarFlyout.categoryId);
        if (!cat) return null;
        const catTabs = cat.tabs.filter(t => allowedTabs.includes(t as Tab));
        if (catTabs.length <= 1) return null;
        return (
          <motion.div
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
          </motion.div>
        );
      })()}
    </>
  );
}
