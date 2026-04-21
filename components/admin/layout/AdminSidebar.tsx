"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { m } from "@/components/admin/providers";
import {
  ChevronRight,
  ChevronDown,
  Globe,
  Store,
  PanelLeftClose,
  PanelLeft,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
// resolveSessionStorefrontTarget removed — use activeTenantSlug directly
import { useModuleTabs } from "@/contexts/module-tabs-context";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import { MODULE_INFO, TAB_CATEGORIES } from "@/app/admin/_lib/tab-categories";
import { SidebarFlyout } from "@/components/admin/shared/SidebarFlyout";
import SidebarConfigurator from "@/components/admin/shared/SidebarConfigurator";
import type { SidebarTheme } from "@/components/admin/shared/SidebarConfigurator";
import { BulejeMark } from "@/components/ui-system/illustrations";

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
  isEasyMode?: boolean;
  onToggleAdminMode?: () => void;

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

    const href = activeTenantSlug ? `/t/${activeTenantSlug}/tienda` : "/marketplace";
    if (active) setStoreHref(href);

    return () => {
      active = false;
    };
  }, [activeTenantSlug]);

  /* Tema del sidebar: 3 opciones persistidas en localStorage.
     - "cristal": paleta de marca Buleje (teal accent). Default moderno.
     - "light": neutro blanco, minimalista.
     - "dark": fondo zinc-900 para uso prolongado / modo oscuro.
     "shaded" se conserva como alias legacy → cristal. */
  const [sidebarTheme, setSidebarTheme] = React.useState<SidebarTheme>(() => {
    if (typeof window === "undefined") return "cristal";
    try {
      const stored = localStorage.getItem("admin-sidebar-theme");
      if (stored === "light" || stored === "dark" || stored === "cristal" || stored === "shaded") return stored;
    } catch { /* ignore */ }
    return "cristal";
  });

  const updateTheme = React.useCallback((theme: SidebarTheme) => {
    setSidebarTheme(theme);
    try { localStorage.setItem("admin-sidebar-theme", theme); } catch { /* ignore */ }
  }, []);

  // ── Hidden categories (persisted in localStorage) ──
  const [hiddenCategories, setHiddenCategories] = React.useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("admin-sidebar-hidden");
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });

  // ── Hidden individual sub-tabs (persisted in localStorage) ──
  const [hiddenSubTabs, setHiddenSubTabs] = React.useState<Set<Tab>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("admin-sidebar-hidden-tabs");
      if (stored) return new Set(JSON.parse(stored) as Tab[]);
    } catch { /* ignore */ }
    return new Set();
  });

  // ── Category order (persisted in localStorage) ──
  const [categoryOrder, setCategoryOrder] = React.useState<string[]>(() => {
    if (typeof window === "undefined") return TAB_CATEGORIES.map(c => c.id);
    try {
      const stored = localStorage.getItem("admin-sidebar-order");
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return TAB_CATEGORIES.map(c => c.id);
  });

  // ── Config mode ──
  const [configMode, setConfigMode] = React.useState(false);

  const handleConfigSave = React.useCallback((config: {
    hiddenCategories: Set<string>;
    hiddenSubTabs: Set<Tab>;
    categoryOrder: string[];
    theme: SidebarTheme;
  }) => {
    setHiddenCategories(config.hiddenCategories);
    setHiddenSubTabs(config.hiddenSubTabs);
    setCategoryOrder(config.categoryOrder);
    updateTheme(config.theme);
    try {
      localStorage.setItem("admin-sidebar-hidden", JSON.stringify([...config.hiddenCategories]));
      localStorage.setItem("admin-sidebar-hidden-tabs", JSON.stringify([...config.hiddenSubTabs]));
      localStorage.setItem("admin-sidebar-order", JSON.stringify(config.categoryOrder));
    } catch { /* ignore */ }
    setConfigMode(false);
  }, [updateTheme]);

  // ── Reorder visibleCategories by categoryOrder + filter hidden ──
  const orderedVisibleCategories = React.useMemo(() => {
    const map = new Map(visibleCategories.map(c => [c.id, c]));
    const result: TabCategory[] = [];
    for (const id of categoryOrder) {
      const cat = map.get(id);
      if (cat && !hiddenCategories.has(id)) result.push(cat);
    }
    // Any new categories not in saved order
    for (const cat of visibleCategories) {
      if (!categoryOrder.includes(cat.id) && !hiddenCategories.has(cat.id)) {
        result.push(cat);
      }
    }
    return result;
  }, [visibleCategories, categoryOrder, hiddenCategories]);

  /* 3 temas: cristal (color fuerte del logo — teal sólido), dark (zinc),
     light (blanco neutro). 'shaded' es alias legacy → cristal.
     Cristal NO es transparente: usa bg-primary sólido con texto blanco
     como fondo del sidebar, reflejando el color principal de la marca. */
  const themeClasses = React.useMemo(() => {
    switch (sidebarTheme) {
      case "shaded": // alias legacy → cristal
      case "cristal":
        return {
          /* Fondo primary fuerte (mismo tono que el logo Buleje). */
          bg: "bg-primary dark:bg-primary-dark",
          text: "text-white/85",
          /* Hover sutil — apenas aclara el fondo. NO se pone oscuro. */
          hover: "hover:bg-white/10 hover:text-white",
          border: "border-white/10",
          activeItem: "bg-white/15 text-white font-semibold",
          headerBorder: "border-white/10",
        };
      case "dark":
        return {
          bg: "bg-zinc-900",
          text: "text-zinc-300",
          /* Dark mode: hover MUY sutil, no oscuro puro. */
          hover: "hover:bg-white/[0.06] hover:text-white",
          border: "border-white/[0.08]",
          activeItem: "bg-white/[0.08] text-white",
          headerBorder: "border-white/[0.08]",
        };
      default: // light
        return {
          bg: "bg-white dark:bg-card",
          text: "text-[var(--text-secondary)]",
          hover: "hover:bg-[var(--surface-sunken)]/40",
          border: "border-[var(--rule-soft)] dark:border-card-border",
          activeItem: "bg-gray-50 dark:bg-zinc-800/50",
          headerBorder: "border-[var(--rule-soft)] dark:border-card-border",
        };
    }
  }, [sidebarTheme]);

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
      try {
        localStorage.setItem("admin-sidebar-compact", next ? "true" : "false");
        /* Dispara evento custom para que el layout principal reajuste el
           margin del main immediate (sin esperar el polling de 500ms). */
        window.dispatchEvent(new CustomEvent("admin-sidebar-compact-change", { detail: { compact: next } }));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ── Auto-collapse on narrow screens (<1024px) ──
  const [isNarrow, setIsNarrow] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    setIsNarrow(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Effective compact: parent focusMode OR local compact toggle OR narrow viewport
  const effectiveCompact = focusMode || isCompact || isNarrow;

  // Track which multi-tab categories are expanded (shows sub-tabs).
  // Desktop: NO auto-expand vertical — los sub-tabs emergen exclusivamente
  // via flyout lateral on hover. Mobile: accordion on-click del usuario.
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(() => new Set());

  // ── Flyout state for expanded sidebar hover ──
  const [hoveredCategory, setHoveredCategory] = React.useState<string | null>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  // ── Tooltip de nombre de modulo (compact mode). Usa position:fixed
  //    para escapar del overflow del nav interno.
  const [compactTooltip, setCompactTooltip] = React.useState<
    { y: number; label: string; tip?: string } | null
  >(null);

  const handleCompactHover = React.useCallback((btn: HTMLElement | null, label: string, tip?: string) => {
    if (!effectiveCompact || !btn) return;
    const r = btn.getBoundingClientRect();
    setCompactTooltip({ y: r.top + r.height / 2, label, tip });
  }, [effectiveCompact]);

  const handleCompactLeave = React.useCallback(() => {
    setCompactTooltip(null);
  }, []);

  const [flyoutPosition, setFlyoutPosition] = React.useState<{ top: number } | null>(null);
  React.useEffect(() => {
    if (!hoveredCategory) {
      setFlyoutPosition(null);
      return;
    }
    const el = categoryRefs.current[hoveredCategory];
    if (!el) {
      setFlyoutPosition(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setFlyoutPosition({ top: rect.top });
  }, [hoveredCategory]);

  /* Delays agresivos para UX responsiva. 300ms / 500ms eran lentos y
     rompian el sentido de "accion inmediata" al pasar el mouse. Ahora:
     open = 80ms (casi instantaneo), close = 60ms (permite cruzar a otro
     item sin flicker). */
  const handleCategoryMouseEnter = React.useCallback((categoryId: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredCategory(categoryId);
    }, 80);
  }, []);

  const handleCategoryMouseLeave = React.useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredCategory(null);
    }, 60);
  }, []);

  const handleFlyoutMouseEnter = React.useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const handleFlyoutMouseLeave = React.useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredCategory(null);
    }, 60);
  }, []);

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Uniform minimalist icon color — light gray for all categories
  const ICON_COLORS: Record<string, string> = {
    dashboard: "text-[var(--text-tertiary)]", ventas: "text-[var(--text-tertiary)]", productos: "text-[var(--text-tertiary)]",
    inventario: "text-[var(--text-tertiary)]", compras: "text-[var(--text-tertiary)]", finanzas: "text-[var(--text-tertiary)]",
    clientes: "text-[var(--text-tertiary)]", "marketplace-ops": "text-[var(--text-tertiary)]", analytics: "text-[var(--text-tertiary)]",
    comunicacion: "text-[var(--text-tertiary)]", documentos: "text-[var(--text-tertiary)]", "mi-tienda": "text-[var(--text-tertiary)]",
    metas: "text-[var(--text-tertiary)]",
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
        "hidden md:flex fixed left-0 bottom-0 z-40 flex-col transition-[width] duration-[var(--dur-base)] ease-in-out overflow-hidden border-r",
        themeClasses.bg,
        themeClasses.border,
        effectiveCompact ? "w-[60px]" : "w-[260px]",
        presentationMode && "hidden!",
        isSuperAdminImpersonating ? "top-10" : "top-0"
      )}>
        {/* ── Header: tenant + user ── */}
        {/* ── Configurator overlay (replaces sidebar content when active) ── */}
        {configMode && !effectiveCompact && (
          <SidebarConfigurator
            allCategories={TAB_CATEGORIES}
            hiddenCategories={hiddenCategories}
            hiddenSubTabs={hiddenSubTabs}
            categoryOrder={categoryOrder}
            theme={sidebarTheme}
            allTabs={allTabs}
            allowedTabs={allowedTabs}
            onSave={handleConfigSave}
            onCancel={() => setConfigMode(false)}
          />
        )}

        {/* Normal sidebar content (hidden when configMode) */}
        {(!configMode || effectiveCompact) && (<>
        <div className={cn(
          "flex items-center gap-3 h-16 border-b transition-all duration-[var(--dur-base)]",
          themeClasses.headerBorder,
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
            <div className="h-9 w-9 rounded-lg bg-[var(--text-primary)] text-[var(--surface-canvas)] flex items-center justify-center shrink-0">
              <BulejeMark size={20} strokeWidth={1.75} />
            </div>
          )}
          {!effectiveCompact && (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm leading-tight truncate">
                {activeTenantName ?? "Mi Bodega"}
              </p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted leading-tight mt-0.5">
                <span className="capitalize">{userName}</span>
                {" · "}
                <span className="uppercase text-[length:var(--ts-2xs)] font-semibold text-[var(--data-success)]">{userRole}</span>
              </p>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav className={cn(
          "flex-1 overflow-y-auto py-2 transition-all duration-[var(--dur-base)] scrollbar-hide",
          effectiveCompact ? "px-1.5" : "px-2.5"
        )}>
          {/* ── Main modules (expanded mode) ── */}
          {!effectiveCompact && orderedVisibleCategories.map((category, catIdx) => {
            const catTabs = category.tabs.filter(
              t => allowedTabs.includes(t as Tab) && !hiddenTabs.has(t as Tab) && !hiddenSubTabs.has(t as Tab)
            );
            if (catTabs.length === 0) return null;
            const CategoryIcon = category.icon;
            const isSingleTab = catTabs.length === 1;
            const sectionLabel = SECTION_BEFORE[category.id];
            const iconColor = ICON_COLORS[category.id] ?? "text-[var(--text-tertiary)]";
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
                      <div className={cn("my-2 border-t", themeClasses.border)} />
                    )}
                    <button
                      onClick={() => toggleSection(sectionLabel)}
                      className="w-full flex items-center gap-1.5 px-3 mt-3 mb-1 group/section"
                    >
                      <ChevronDown className={cn(
                        "h-3 w-3 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] transition-transform duration-[var(--dur-base)]",
                        isSectionCollapsed && "-rotate-90"
                      )} />
                      <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] group-hover/section:text-[var(--text-tertiary)] dark:group-hover/section:text-[var(--text-secondary)] transition-colors">
                        {sectionLabel}
                      </span>
                    </button>
                  </>
                )}

                {/* ── Category items with grid animation for collapse ── */}
                <div
                  className="grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-in-out"
                  style={{ gridTemplateRows: (sectionLabel && isSectionCollapsed) ? "0fr" : "1fr" }}
                >
                  <div className="overflow-hidden">
                    <div className="group/cat relative">
                    <button
                      ref={(el) => { categoryRefs.current[category.id] = el; }}
                      data-tour-tab={isSingleTab ? catTabs[0] : category.id}
                      onMouseEnter={(e) => {
                        if (!isSingleTab) handleCategoryMouseEnter(category.id);
                        // Compact: mostrar tooltip lateral con nombre + tip opcional
                        const tipTabId = isSingleTab ? catTabs[0] : catTabs[0];
                        const tipText = MODULE_INFO[tipTabId as Tab]?.tip;
                        handleCompactHover(e.currentTarget, displayLabel, tipText);
                      }}
                      onMouseLeave={() => {
                        if (!isSingleTab) handleCategoryMouseLeave();
                        handleCompactLeave();
                      }}
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
                        "group relative w-full flex items-center gap-3 rounded-lg text-[length:var(--ts-sm)] font-medium transition-all duration-[var(--dur-fast)] mb-px",
                        "px-3 py-2.5",
                        isActive
                          ? cn(themeClasses.activeItem, sidebarTheme === "dark" ? "text-white font-semibold" : "text-[var(--text-primary)] font-semibold")
                          : cn(themeClasses.text, themeClasses.hover, sidebarTheme === "dark" ? "hover:text-white" : "hover:text-[var(--text-primary)] dark:hover:text-gray-200")
                      )}
                    >
                      {/* Active indicator bar — 3px left bar with category color */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--accent-soft)]" />
                      )}

                      <DisplayIcon className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-all duration-[var(--dur-base)] group-hover:scale-110",
                        isActive ? "text-[var(--data-success)] dark:text-[var(--data-success)]" : iconColor
                      )} />

                      <span className="truncate flex-1 text-left">{displayLabel}</span>

                      {totalAlerts > 0 && (
                        <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error)] text-white leading-none animate-pulse">
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
                            isActive ? "text-[var(--data-success)]" : "text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] group-hover:text-[var(--text-tertiary)]"
                          )} />
                        </m.div>
                      )}
                    </button>

                    {/* Tooltip expanded — tip largo solo en modo expandido.
                        El tooltip de nombre para compact se renderiza
                        globalmente via compactTooltip state (escapa del
                        overflow clip del nav). */}
                    {!effectiveCompact && (() => {
                      const tipTabId = isSingleTab ? catTabs[0] : catTabs[0];
                      const tipText = MODULE_INFO[tipTabId as Tab]?.tip;
                      if (!tipText) return null;
                      return (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 opacity-0 pointer-events-none group-hover/cat:opacity-100 transition-opacity duration-100 delay-[60ms] z-50">
                          <div className="relative bg-white dark:bg-[var(--surface-raised)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-2 max-w-[220px] leading-relaxed shadow-lg border border-[var(--rule-base)] dark:border-white/10">
                            <div className="absolute top-1/2 -translate-y-1/2 right-full w-0 h-0 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-white dark:border-r-[var(--surface-raised)]" />
                            {tipText}
                          </div>
                        </div>
                      );
                    })()}
                    </div>

                    {/* Animated sub-tabs for multi-tab categories */}
                    {!isSingleTab && (
                      <div
                        className="grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-in-out"
                        style={{ gridTemplateRows: expandedCategories.has(category.id) ? "1fr" : "0fr" }}
                      >
                        <div className="overflow-hidden">
                          <div className={cn("ml-4 pl-3 border-l-2 space-y-0.5 py-1", themeClasses.border)}>
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
                                    "group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[length:var(--ts-sm)] transition-all",
                                    isSubActive
                                      ? cn(themeClasses.activeItem, sidebarTheme === "dark" ? "text-white font-semibold" : "text-[var(--text-primary)] font-semibold")
                                      : cn(themeClasses.text, themeClasses.hover, "font-medium")
                                  )}
                                >
                                  {isSubActive && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-[var(--accent-soft)]" />
                                  )}
                                  <SubIcon className={cn(
                                    "h-4 w-4 shrink-0 transition-transform duration-[var(--dur-base)] group-hover:scale-110",
                                    isSubActive ? "text-[var(--data-success)]" : "text-[var(--text-tertiary)]"
                                  )} />
                                  <span className="truncate">{subTabInfo.label}</span>
                                  {subAlertCount > 0 && (
                                    <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error)] text-white leading-none ml-auto animate-pulse">
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
                  "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[length:var(--ts-sm)] font-medium transition-all mb-px",
                  tab === id
                    ? "bg-gray-50 dark:bg-zinc-800/50 text-[var(--text-primary)] font-semibold"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]/40"
                )}
              >
                {tab === id && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--accent-soft)]" />
                )}
                <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-[var(--dur-base)] group-hover:scale-110", tab === id ? "text-[var(--data-success)]" : "")} />
                <span className="truncate flex-1 text-left">{label}</span>
                {alertCount > 0 && (
                  <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error)] text-white leading-none animate-pulse">
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Icon-only in compact/focus mode.
              Tooltip lateral se renderiza globalmente via compactTooltip state
              (position:fixed, escapa del overflow clip del nav). */}
          {effectiveCompact && filteredTabs.map(({ id, label, icon: Icon }) => {
            const alertCount = alerts[id] ?? 0;
            const isActive = tab === id;
            return (
              <div key={id} className="relative">
                <button
                  data-tour-tab={id}
                  onClick={() => navigateTab(id)}
                  onMouseEnter={(e) => handleCompactHover(e.currentTarget, label)}
                  onMouseLeave={handleCompactLeave}
                  aria-label={label}
                  className={cn(
                    "relative w-full flex items-center justify-center rounded-lg transition-all mb-0.5 px-0 py-2.5",
                    isActive
                      ? cn(themeClasses.activeItem)
                      : cn(themeClasses.text, themeClasses.hover),
                  )}
                >
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-white/70" />}
                  <Icon className="h-5 w-5 shrink-0 transition-transform duration-[var(--dur-base)]" />
                  {alertCount > 0 && (
                    <span className="absolute top-1 right-1 text-[length:var(--ts-2xs)] font-bold rounded-full w-4 h-4 flex items-center justify-center bg-[var(--data-error)] text-white leading-none animate-pulse">
                      {alertCount > 9 ? "9+" : alertCount}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        {/* ── Footer: mode toggle + external links + compact toggle ── */}
        <div className={cn(
          "py-3 border-t space-y-0.5 transition-all duration-[var(--dur-base)]",
          themeClasses.headerBorder,
          effectiveCompact ? "px-1.5" : "px-2.5"
        )}>
          {/* Easy / Advanced mode toggle */}
          {!effectiveCompact && (
            <button
              onClick={onToggleAdminMode}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[length:var(--ts-sm)] font-medium transition-all text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]/40 group"
            >
              <div className={cn(
                "relative h-5 w-9 rounded-full transition-colors shrink-0",
                isEasyMode ? "bg-primary" : "bg-[var(--accent-soft)]"
              )}>
                <div className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white  transition-transform",
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
              className="relative w-full flex items-center justify-center rounded-lg transition-all mb-0.5 px-0 py-2.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]/40 hover:text-[var(--text-secondary)]"
            >
              <div className={cn(
                "h-5 w-9 rounded-full transition-colors",
                isEasyMode ? "bg-primary" : "bg-[var(--accent-soft)]"
              )}>
                <div className={cn(
                  "absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white  transition-transform",
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
              "flex items-center rounded-lg text-[length:var(--ts-sm)] font-medium text-[var(--text-tertiary)] hover:text-[var(--data-success)] hover:bg-[var(--accent-soft)]/50 dark:hover:bg-[var(--accent-muted)] transition-all",
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
              "flex items-center rounded-lg text-[length:var(--ts-sm)] font-medium text-[var(--text-tertiary)] hover:text-[var(--data-success)] hover:bg-[var(--accent-soft)]/50 dark:hover:bg-[var(--accent-muted)] transition-all",
              effectiveCompact ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
            )}
          >
            <Store className="h-[18px] w-[18px] shrink-0" /> {!effectiveCompact && "Mi Tienda"}
          </Link>

          {/* ── Compact mode toggle (hidden when auto-collapsed on narrow screens) ── */}
          {!focusMode && !isNarrow && (
            <>
              <div className={cn("my-1.5 border-t", themeClasses.border)} />
              <button
                onClick={toggleCompact}
                title={isCompact ? "Expandir sidebar" : "Compactar sidebar"}
                className={cn(
                  "flex items-center rounded-lg text-[length:var(--ts-sm)] font-medium transition-all",
                  themeClasses.text, themeClasses.hover,
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

          {/* ── Configure sidebar button ── */}
          {!effectiveCompact && (
            <>
              <div className={cn("my-1.5 border-t", themeClasses.border)} />
              <button
                onClick={() => setConfigMode(true)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-[length:var(--ts-sm)] font-medium transition-all",
                  themeClasses.text, themeClasses.hover
                )}
              >
                <SlidersHorizontal className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">Configurar barra lateral</span>
              </button>
            </>
          )}
          {effectiveCompact && (
            <button
              onClick={() => setConfigMode(true)}
              title="Configurar barra lateral"
              className={cn(
                "flex items-center justify-center w-full px-0 py-2.5 rounded-lg text-[length:var(--ts-sm)] font-medium transition-all",
                themeClasses.text, themeClasses.hover
              )}
            >
              <SlidersHorizontal className="h-[18px] w-[18px] shrink-0" />
            </button>
          )}
        </div>
        </>)}
      </aside>

      {/* Tooltip lateral para iconos en modo compact — position:fixed
          para escapar el overflow clip del nav. Card blanca con arrow. */}
      {effectiveCompact && compactTooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: 70, top: compactTooltip.y, transform: "translateY(-50%)" }}
        >
          <div className="relative bg-white dark:bg-[var(--surface-raised)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-2 shadow-lg border border-[var(--rule-base)] dark:border-white/10 min-w-[140px] max-w-[240px]">
            <div className="absolute top-1/2 -translate-y-1/2 right-full w-0 h-0 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-white dark:border-r-[var(--surface-raised)]" />
            <div className="font-semibold whitespace-nowrap">{compactTooltip.label}</div>
            {compactTooltip.tip && (
              <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">{compactTooltip.tip}</div>
            )}
          </div>
        </div>
      )}

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
            className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl py-2 w-60 max-h-[80vh] overflow-y-auto"
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
                      : "text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface font-medium"
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

      {/* Sidebar flyout panel — expanded mode hover (Holded-style) */}
      {!effectiveCompact && hoveredCategory && flyoutPosition && (() => {
        const cat = visibleCategories.find(c => c.id === hoveredCategory);
        if (!cat) return null;
        const catTabs = cat.tabs.filter(
          t => allowedTabs.includes(t as Tab) && !hiddenTabs.has(t as Tab)
        );
        if (catTabs.length <= 1) return null;
        const flyoutTabs = catTabs
          .map(tId => allTabs.find(t => t.id === tId))
          .filter((t): t is typeof allTabs[number] => t != null)
          .map(t => ({ id: t.id as string, label: t.label, icon: t.icon as React.ComponentType<{ className?: string }> }));
        return (
          <SidebarFlyout
            key={hoveredCategory}
            category={{ id: cat.id, label: cat.label, tabs: catTabs as string[] }}
            tabs={flyoutTabs}
            activeTab={tab}
            onNavigate={(tabId) => navigateTab(tabId as Tab)}
            position={flyoutPosition}
            onClose={() => setHoveredCategory(null)}
            onMouseEnter={handleFlyoutMouseEnter}
            onMouseLeave={handleFlyoutMouseLeave}
            theme={sidebarTheme === "shaded" ? "cristal" : sidebarTheme === "dark" ? "dark" : sidebarTheme === "light" ? "light" : "cristal"}
          />
        );
      })()}
    </>
  );
}
