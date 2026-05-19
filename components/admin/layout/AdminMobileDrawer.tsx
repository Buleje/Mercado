"use client";

import React from "react";
import Link from "next/link";
import {
  X,
  ShoppingBasket,
  Layers,
  ChevronDown,
  ChevronUp,
  Star,
  Clock,
  Zap,
  Globe,
  Store,
  Power,
  Pencil,
  Plus,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useAdminTemplateOverlay } from "@/app/admin/_hooks/useAdminTemplateOverlay";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import type { AllTabsItem, ResolvedShortcut } from "@/app/admin/_hooks/useSidebarShortcuts";

// Re-exportamos AllTabsItem como TabItem para legibilidad
type TabItem = AllTabsItem;

export type AdminMobileDrawerProps = {
  open: boolean;
  onClose: () => void;

  // Tenant
  activeTenantName: string | null;

  // Tab activa + navegación
  tab: Tab;
  navigateTab: (tab: Tab) => void;

  // Tabs filtradas por rol/búsqueda/categoría
  filteredTabs: TabItem[];
  allowedTabs: readonly string[];

  // Categorías
  visibleCategories: TabCategory[];
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
  categoryDropdownOpen: boolean;
  onToggleCategoryDropdown: () => void;

  // Favoritos, recientes y atajos
  favoriteTabItems: TabItem[];
  customShortcutItems: TabItem[];
  recentTabItems: TabItem[];
  recentCollapsed: boolean;
  onToggleRecentCollapsed: () => void;
  favoriteTabs: Set<string>;
  onToggleFavorite: (id: Tab) => void;

  // Accesos rápidos (shortcuts del sidebar)
  resolvedShortcuts: ResolvedShortcut[];
  editingShortcuts: boolean;
  onToggleEditingShortcuts: () => void;
  showAddShortcut: boolean;
  onToggleShowAddShortcut: () => void;
  availableForShortcut: TabItem[];
  onAddShortcut: (id: string) => void;
  onRemoveShortcut: (id: string) => void;
  onMoveShortcut: (idx: number, dir: 1 | -1) => void;

  // Alertas y badges demo
  alerts: Record<string, number>;
  demoDataModules: Partial<Record<string, { label: string; api?: string }>>;
  clearedDemoTabs: Set<string>;

  // Acciones globales
  onOpenCierreDiario: () => void;
  onLogout: () => void;
};

export function AdminMobileDrawer({
  open,
  onClose,
  activeTenantName,
  tab,
  navigateTab,
  filteredTabs,
  allowedTabs,
  visibleCategories,
  selectedCategory,
  onSelectCategory,
  categoryDropdownOpen,
  onToggleCategoryDropdown,
  favoriteTabItems,
  customShortcutItems,
  recentTabItems,
  recentCollapsed,
  onToggleRecentCollapsed,
  favoriteTabs,
  onToggleFavorite,
  resolvedShortcuts,
  editingShortcuts,
  onToggleEditingShortcuts,
  showAddShortcut,
  onToggleShowAddShortcut,
  availableForShortcut,
  onAddShortcut,
  onRemoveShortcut,
  onMoveShortcut,
  alerts,
  demoDataModules,
  clearedDemoTabs,
  onOpenCierreDiario,
}: AdminMobileDrawerProps) {
  // Plantilla del superadmin — overlay reactivo (mismo que sidebar desktop).
  const { isHiddenByTemplate } = useAdminTemplateOverlay();
  return (
    <>
      {/* Mobile nav overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile drawer — ancho fluido para celulares (85vw deja franja
          minima clicable para cerrar) con cap en sm+ para tabletas chicas. */}
      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 w-[85vw] max-w-sm z-50 bg-[var(--surface-raised)] flex flex-col transition-transform duration-[var(--dur-base)] sm:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary text-white flex items-center justify-center">
              <ShoppingBasket className="h-4 w-4" />
            </div>
            <span className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">
              {activeTenantName || "Buleje"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
          </button>
        </div>

        {/* Category selector (mobile) */}
        <div className="relative px-3 py-3 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
          <button
            onClick={onToggleCategoryDropdown}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-accent transition-all border border-[var(--rule-base)] dark:border-[var(--rule-base)]"
          >
            <div className="flex items-center gap-2">
              {selectedCategory ? (
                <>
                  {visibleCategories.find(c => c.id === selectedCategory)?.icon && (
                    React.createElement(
                      visibleCategories.find(c => c.id === selectedCategory)!.icon,
                      { className: "h-4 w-4 shrink-0" }
                    )
                  )}
                  <span className="truncate">
                    {visibleCategories.find(c => c.id === selectedCategory)?.label}
                  </span>
                </>
              ) : (
                <>
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Todas las categorías</span>
                </>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform shrink-0",
                categoryDropdownOpen && "rotate-180"
              )}
            />
          </button>

          {categoryDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={onToggleCategoryDropdown}
              />
              <div className="absolute top-full left-3 right-3 mt-1 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] z-20 max-h-80 overflow-y-auto py-2">
                <button
                  onClick={() => {
                    onSelectCategory(null);
                    onToggleCategoryDropdown();
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                    !selectedCategory
                      ? "bg-primary/10 text-primary"
                      : "text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-surface"
                  )}
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <span>Todas ({allowedTabs.length})</span>
                </button>
                <div className="h-px bg-gray-100 dark:bg-card-border my-1" />
                {visibleCategories.map(category => {
                  const count = category.tabs.filter(t => allowedTabs.includes(t) && !isHiddenByTemplate(t)).length;
                  if (count === 0) return null;
                  const CategoryIcon = category.icon;
                  return (
                    <button
                      key={category.id}
                      onClick={() => {
                        onSelectCategory(category.id);
                        onToggleCategoryDropdown();
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                        selectedCategory === category.id
                          ? "bg-primary/10 text-primary"
                          : "text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-surface"
                      )}
                    >
                      <CategoryIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1 text-left">{category.label}</span>
                      <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">({count})</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {/* Favorite tabs section */}
          {(favoriteTabItems.length > 0 || customShortcutItems.length > 0) && (
            <div className="mb-2">
              <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted px-4 mb-1 flex items-center gap-1">
                <Star className="h-3 w-3" /> Favoritos
              </p>
              {favoriteTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`fav-${id}`}
                  onClick={() => { navigateTab(id as Tab); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id
                      ? "bg-primary text-white "
                      : "text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              {customShortcutItems.map(({ id, label, icon: _Icon }) => (
                <button
                  key={`sc-${id}-${label}`}
                  onClick={() => { navigateTab(id as Tab); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id
                      ? "bg-primary text-white "
                      : "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)] dark:hover:bg-accent"
                  )}
                >
                  <Zap className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning-500)]" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
              <div className="h-px bg-gray-100 dark:bg-card-border mx-2 my-1.5" />
            </div>
          )}

          {/* Recent tabs section */}
          {recentTabItems.length > 0 && (
            <div className="mb-2">
              <button
                onClick={onToggleRecentCollapsed}
                className="w-full text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted px-4 mb-1 flex items-center gap-1 hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] transition-colors"
              >
                <Clock className="h-3 w-3" /> Recientes
                {recentCollapsed
                  ? <ChevronDown className="h-3 w-3 ml-auto" />
                  : <ChevronUp className="h-3 w-3 ml-auto" />}
              </button>
              {!recentCollapsed && recentTabItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={`rec-${id}`}
                  onClick={() => { navigateTab(id as Tab); onClose(); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all mb-0.5",
                    tab === id
                      ? "bg-primary text-white "
                      : "text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
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
              onClick={() => { navigateTab(id as Tab); onClose(); }}
              className={cn(
                "group w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all mb-1",
                tab === id
                  ? "bg-primary text-white "
                  : "text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate flex-1 text-left">{label}</span>
              {demoDataModules[id] && !clearedDemoTabs.has(id) && (
                <span
                  title="Contiene datos de ejemplo"
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    tab === id ? "bg-[var(--data-error-500)]" : "bg-[var(--data-error-500)]"
                  )}
                />
              )}
              {alerts[id] && (
                <span
                  className={cn(
                    "text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center",
                    tab === id ? "bg-white/20 text-white" : "bg-[var(--data-error-500)] text-white"
                  )}
                >
                  {alerts[id]}
                </span>
              )}
              <Star
                onClick={e => { e.stopPropagation(); onToggleFavorite(id as Tab); }}
                className={cn(
                  "h-4 w-4 shrink-0 transition-all cursor-pointer",
                  favoriteTabs.has(id)
                    ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                    : "opacity-0 group-hover:opacity-60 text-[var(--text-tertiary)]"
                )}
              />
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] space-y-1">
          {/* Quick access shortcuts — mobile */}
          <div className="mb-2 space-y-0.5">
            <div className="flex items-center justify-between px-4 mb-1">
              <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                Accesos rápidos
              </p>
              <button
                onClick={onToggleEditingShortcuts}
                className="text-[var(--text-tertiary)] hover:text-primary transition-colors"
                title="Editar accesos rápidos"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            {resolvedShortcuts.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-1">
                {editingShortcuts && (
                  <div className="flex flex-col -mr-1">
                    <button
                      onClick={() => onMoveShortcut(idx, -1)}
                      disabled={idx === 0}
                      className="text-[var(--text-tertiary)] hover:text-primary disabled:opacity-20 p-0 leading-none"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onMoveShortcut(idx, 1)}
                      disabled={idx === resolvedShortcuts.length - 1}
                      className="text-[var(--text-tertiary)] hover:text-primary disabled:opacity-20 p-0 leading-none"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => {
                    if (!editingShortcuts) {
                      navigateTab(s.id as Tab);
                      onClose();
                    }
                  }}
                  className={cn(
                    "flex-1 flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                    tab === s.id
                      ? "bg-primary/10 text-primary"
                      : "text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"
                  )}
                >
                  <s.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{s.label}</span>
                  {!editingShortcuts && alerts[s.id] && (
                    <span className="ml-auto text-xs font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center bg-[var(--data-error-500)] text-white">
                      {alerts[s.id]}
                    </span>
                  )}
                </button>
                {editingShortcuts && (
                  <button
                    onClick={() => onRemoveShortcut(s.id)}
                    className="p-1 text-[var(--data-error-500)] hover:text-[var(--data-error-500)] transition-colors"
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
                  className="w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium text-primary/70 hover:bg-primary/5 transition-all border border-dashed border-primary/30"
                >
                  <Plus className="h-4 w-4" /> Agregar acceso
                </button>
                {showAddShortcut && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl max-h-48 overflow-y-auto">
                    {availableForShortcut.map((t: TabItem) => (
                      <button
                        key={t.id}
                        onClick={() => onAddShortcut(t.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                      >
                        <t.icon className="h-4 w-4 shrink-0" /> {t.label}
                      </button>
                    ))}
                    {availableForShortcut.length === 0 && (
                      <p className="px-3 py-2 text-xs text-[var(--text-tertiary)]">Ya están todos agregados</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Link
            href="/marketplace"
            target="_blank"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-indigo-950/30 transition-all"
          >
            <Globe className="h-5 w-5" /> Marketplace
          </Link>
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-all"
          >
            <Store className="h-5 w-5" /> Tienda
          </Link>
          <button
            onClick={() => { onOpenCierreDiario(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/30 transition-all"
          >
            <Power className="h-5 w-5" /> Cerrar día
          </button>
        </div>
      </aside>
    </>
  );
}
