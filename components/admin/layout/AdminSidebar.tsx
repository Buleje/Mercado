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
import { useAdminTemplateOverlay } from "@/app/admin/_hooks/useAdminTemplateOverlay";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import { MODULE_INFO, TAB_CATEGORIES } from "@/app/admin/_lib/tab-categories";
import { SidebarFlyout } from "@/components/admin/shared/SidebarFlyout";
import SidebarConfigurator from "@/components/admin/shared/SidebarConfigurator";
import type { SidebarTheme, AccentColor, Density, IconStyle } from "@/components/admin/shared/SidebarConfigurator";
import { BulejeMark } from "@/components/ui-system/illustrations";
import { useTenant } from "@/contexts/tenant-context";
import {
  getVerticalConfig,
  filterTabsForVertical,
  type Industry,
} from "@/lib/verticals/registry";

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
  isEasyMode: _isEasyMode,
  onToggleAdminMode: _onToggleAdminMode,
  allTabs,
}: AdminSidebarProps) {
  const { subTabs: _subTabs, activeSubTab: _activeSubTab } = useModuleTabs();

  // ── Vertical filtering via industry ──────────────────────────────────────
  const { industry } = useTenant();
  const verticalConfig = React.useMemo(
    () => getVerticalConfig(industry as Industry | undefined),
    [industry],
  );
  const verticalEnabledSet = React.useMemo(
    () => new Set(verticalConfig.modules.enabled.map(String)),
    [verticalConfig],
  );
  const verticalHiddenSet = React.useMemo(
    () => new Set(verticalConfig.modules.hidden.map(String)),
    [verticalConfig],
  );
  const verticalFeaturedSet = React.useMemo(
    () => new Set(verticalConfig.modules.featured.map(String)),
    [verticalConfig],
  );
  const verticalComingSoonSet = React.useMemo(
    () => new Set(verticalConfig.modules.comingSoon.map(String)),
    [verticalConfig],
  );

  /** Aplica el filtro vertical sobre una lista de tab ids.
   *  Si el registry no tiene el tab en enabled → lo omite (oculto silencioso).
   *  Si está en hidden → omitido.
   *  Si está en comingSoon → pasa como "comingSoon" (UI disabled).
   */
  const applyVerticalFilter = React.useCallback(
    (tabIds: string[]): { visible: string[]; comingSoon: string[] } => {
      const visible: string[] = [];
      const comingSoon: string[] = [];
      for (const id of tabIds) {
        if (verticalHiddenSet.has(id)) continue;
        if (verticalComingSoonSet.has(id)) {
          comingSoon.push(id);
          continue;
        }
        // Si enabled set tiene contenido, filtrar por él; si está vacío → mostrar todo (fallback seguro)
        if (verticalEnabledSet.size === 0 || verticalEnabledSet.has(id)) {
          visible.push(id);
        }
      }
      return { visible, comingSoon };
    },
    [verticalEnabledSet, verticalHiddenSet, verticalComingSoonSet],
  );

  // Modal "Cambiar tipo de negocio" — solo visible para owner/admin
  const [showIndustryModal, setShowIndustryModal] = React.useState(false);
  const canChangeIndustry = userRole === "owner" || userRole === "admin";

  /* "Ver mi tienda" debe apuntar a la tienda real del negocio.
     Si el slug activo es uno de los demos del SaaS (main/previus/demo/preview),
     no tiene sentido linkear ahí — lo redirige a /tiendas (lista) para que
     el usuario elija su negocio real. */
  const DEMO_TENANT_SLUGS = React.useMemo(
    () => new Set(["main", "previus", "demo", "preview", "default"]),
    [],
  );
  const isRealTenant = !!activeTenantSlug && !DEMO_TENANT_SLUGS.has(activeTenantSlug.toLowerCase());
  const storeHref = isRealTenant ? `/t/${activeTenantSlug}/tienda` : "/tiendas";

  /* Tema del sidebar: 3 opciones persistidas en localStorage.
     - "cristal": paleta de marca Buleje (teal accent). Default moderno.
     - "light": neutro blanco, minimalista.
     - "dark": fondo zinc-900 para uso prolongado / modo oscuro.
     "shaded" se conserva como alias legacy → cristal. */
  // Plantilla del superadmin — overlay reactivo que oculta módulos y reescribe labels.
  // Se actualiza solo cuando se dispara el evento custom buleje:admin-template-changed
  // o el storage event de otra pestaña.
  const { resolveLabel, isHiddenByTemplate } = useAdminTemplateOverlay();

  const [sidebarTheme, setSidebarTheme] = React.useState<SidebarTheme>(() => {
    if (typeof window === "undefined") return "buleje";
    try {
      const stored = localStorage.getItem("admin-sidebar-theme");
      if (stored === "light" || stored === "dark" || stored === "cristal" || stored === "shaded" || stored === "buleje") return stored;
    } catch { /* ignore */ }
    return "buleje";
  });

  const updateTheme = React.useCallback((theme: SidebarTheme) => {
    setSidebarTheme(theme);
    try { localStorage.setItem("admin-sidebar-theme", theme); } catch { /* ignore */ }
  }, []);

  // ── Accent color (persisted) ──
  const [accent, setAccent] = React.useState<AccentColor>(() => {
    if (typeof window === "undefined") return "teal";
    try {
      const s = localStorage.getItem("admin-sidebar-accent");
      if (s === "teal" || s === "emerald" || s === "sky" || s === "violet" || s === "amber" || s === "rose") return s;
    } catch { /* ignore */ }
    return "teal";
  });

  // ── Density (persisted) ──
  const [density, setDensity] = React.useState<Density>(() => {
    if (typeof window === "undefined") return "normal";
    try {
      const s = localStorage.getItem("admin-sidebar-density");
      if (s === "compact" || s === "normal" || s === "spacious") return s;
    } catch { /* ignore */ }
    return "normal";
  });

  // ── Icon style (persisted) ──
  const [iconStyle, setIconStyle] = React.useState<IconStyle>(() => {
    if (typeof window === "undefined") return "colored";
    try {
      const s = localStorage.getItem("admin-sidebar-icon-style");
      if (s === "colored" || s === "monochrome") return s;
    } catch { /* ignore */ }
    return "colored";
  });

  // ── Apply theme to header (persisted) ──
  const [applyToHeader, setApplyToHeader] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("admin-sidebar-apply-to-header") === "true"; } catch { return false; }
  });

  // Propagar apply-to-header + accent al header via evento
  React.useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("admin-sidebar-theming-change", {
          detail: { applyToHeader, theme: sidebarTheme, accent },
        }),
      );
    } catch { /* ignore */ }
  }, [applyToHeader, sidebarTheme, accent]);

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

  // ── Config mode ── con dispatch de evento para que main ajuste margin
  const [configMode, setConfigMode] = React.useState(false);

  const setConfigModeSynced = React.useCallback((next: boolean) => {
    setConfigMode(next);
    try {
      window.dispatchEvent(
        new CustomEvent("admin-sidebar-config-change", { detail: { configMode: next } }),
      );
    } catch { /* ignore */ }
  }, []);

  // ── Snapshot del estado committed al entrar a configMode (para revertir) ──
  const [configSnapshot, setConfigSnapshot] = React.useState<{
    theme: SidebarTheme;
    accent: AccentColor;
    density: Density;
    iconStyle: IconStyle;
    applyToHeader: boolean;
    hiddenCategories: Set<string>;
    hiddenSubTabs: Set<Tab>;
    categoryOrder: string[];
  } | null>(null);

  /* Live preview: cada cambio en el Configurator se aplica inmediatamente
     al sidebar (para que el usuario vea cómo queda). Si cancela, usamos
     el snapshot para revertir. Si guarda, persistimos a localStorage. */
  const handleLiveDraft = React.useCallback((draft: {
    hiddenCategories: Set<string>;
    hiddenSubTabs: Set<Tab>;
    categoryOrder: string[];
    theme: SidebarTheme;
    accent: AccentColor;
    density: Density;
    iconStyle: IconStyle;
    applyToHeader: boolean;
  }) => {
    setHiddenCategories(draft.hiddenCategories);
    setHiddenSubTabs(draft.hiddenSubTabs);
    setCategoryOrder(draft.categoryOrder);
    setSidebarTheme(draft.theme);
    setAccent(draft.accent);
    setDensity(draft.density);
    setIconStyle(draft.iconStyle);
    setApplyToHeader(draft.applyToHeader);
  }, []);

  const handleConfigSave = React.useCallback((config: {
    hiddenCategories: Set<string>;
    hiddenSubTabs: Set<Tab>;
    categoryOrder: string[];
    theme: SidebarTheme;
    accent: AccentColor;
    density: Density;
    iconStyle: IconStyle;
    applyToHeader: boolean;
  }) => {
    /* Live preview ya aplicó los cambios al state; aquí solo persistimos. */
    try {
      localStorage.setItem("admin-sidebar-hidden", JSON.stringify([...config.hiddenCategories]));
      localStorage.setItem("admin-sidebar-hidden-tabs", JSON.stringify([...config.hiddenSubTabs]));
      localStorage.setItem("admin-sidebar-order", JSON.stringify(config.categoryOrder));
      localStorage.setItem("admin-sidebar-theme", config.theme);
      localStorage.setItem("admin-sidebar-accent", config.accent);
      localStorage.setItem("admin-sidebar-density", config.density);
      localStorage.setItem("admin-sidebar-icon-style", config.iconStyle);
      localStorage.setItem("admin-sidebar-apply-to-header", config.applyToHeader ? "true" : "false");
    } catch { /* ignore */ }
    setConfigSnapshot(null);
    setConfigModeSynced(false);
  }, [setConfigModeSynced]);

  /* Open: snapshot del estado committed para poder revertir en cancel. */
  const openConfig = React.useCallback(() => {
    setConfigSnapshot({
      theme: sidebarTheme,
      accent,
      density,
      iconStyle,
      applyToHeader,
      hiddenCategories: new Set(hiddenCategories),
      hiddenSubTabs: new Set(hiddenSubTabs),
      categoryOrder: [...categoryOrder],
    });
    setConfigModeSynced(true);
  }, [sidebarTheme, accent, density, iconStyle, applyToHeader, hiddenCategories, hiddenSubTabs, categoryOrder, setConfigModeSynced]);

  /* Cancel: revertir al snapshot tomado al entrar a configMode. */
  const handleConfigCancel = React.useCallback(() => {
    if (configSnapshot) {
      setHiddenCategories(configSnapshot.hiddenCategories);
      setHiddenSubTabs(configSnapshot.hiddenSubTabs);
      setCategoryOrder(configSnapshot.categoryOrder);
      setSidebarTheme(configSnapshot.theme);
      setAccent(configSnapshot.accent);
      setDensity(configSnapshot.density);
      setIconStyle(configSnapshot.iconStyle);
      setApplyToHeader(configSnapshot.applyToHeader);
    }
    setConfigSnapshot(null);
    setConfigModeSynced(false);
  }, [configSnapshot, setConfigModeSynced]);

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

  /* 3 temas editoriales del sidebar:
     - cristal: slate-900 profundo con acento teal (inspirado en iOS/Linear)
     - dark:    zinc-950 minimalista con texto zinc-300
     - light:   blanco neutro con bordes rule-soft
     Paleta cristal rediseñada — es oscura pero con tinte teal en bordes
     y highlights, NO un bloque de teal plano que se veia saturado. */
  const themeClasses = React.useMemo(() => {
    switch (sidebarTheme) {
      // Theme Buleje editorial v2 — gradient slate-deep + halo teal sutil al inicio.
      // Active state premium: pill con gradient teal + texto blanco BRILLANTE +
      // glow exterior + ring teal-bright + barra inset 4px. Reemplaza el active
      // anterior que tenía bg teal/18 plano + texto teal-300 apagado.
      case "buleje":
      case "shaded": // alias legacy → buleje
      case "cristal":
        // Halo y bordes derivados de var(--accent) vía color-mix → cambian con el preset.
        // El gradient navy base se mantiene (es la identidad oscura del sidebar buleje),
        // pero el HALO superior, los bordes y el active state respetan el accent activo.
        return {
          // Halo radial accent en el top + gradient slate-deep base.
          bg: "bg-[radial-gradient(ellipse_120%_60%_at_50%_0%,color-mix(in_oklab,var(--accent)_18%,transparent)_0%,transparent_60%),linear-gradient(180deg,#0b1f2b_0%,#0a1922_50%,#091621_100%)] dark:bg-[radial-gradient(ellipse_120%_60%_at_50%_0%,color-mix(in_oklab,var(--accent)_14%,transparent)_0%,transparent_60%),linear-gradient(180deg,#050e15_0%,#040a10_50%,#03070d_100%)]",
          // 70% white sobre slate-900 ≈ 9:1 AAA body.
          text: "text-white/70",
          // Hover gradient horizontal sutil — sensación de luz al pasar mouse.
          hover: "hover:bg-linear-to-r hover:from-white/[0.06] hover:to-white/[0.02] hover:text-white",
          // Borde accent hairline — separa del shell respetando el preset.
          border: "border-[color-mix(in_oklab,var(--accent)_25%,transparent)]",
          // Active premium: gradient pill + texto blanco + ring accent + glow + barra inset 4px.
          activeItem: "bg-linear-to-r from-[color-mix(in_oklab,var(--accent)_42%,transparent)] via-[color-mix(in_oklab,var(--accent)_28%,transparent)] to-[color-mix(in_oklab,var(--accent)_10%,transparent)] text-white font-semibold shadow-[inset_4px_0_0_var(--accent),0_2px_16px_-2px_color-mix(in_oklab,var(--accent)_55%,transparent)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
          headerBorder: "border-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
        };
      case "dark":
        return {
          bg: "bg-zinc-950",
          text: "text-zinc-300",
          hover: "hover:bg-white/[0.08] hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
          border: "border-white/[0.06]",
          activeItem: "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]",
          headerBorder: "border-white/[0.06]",
        };
      default: // light
        return {
          bg: "bg-[var(--surface-raised)]",
          text: "text-[var(--text-secondary)]",
          hover: "hover:bg-[var(--accent-soft)]/40 hover:text-[var(--text-primary)]",
          border: "border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
          activeItem: "bg-[var(--accent-soft)] text-primary font-semibold shadow-[inset_0_0_0_1px_color-mix(in oklab, var(--accent) 20%, transparent)]",
          headerBorder: "border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
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
  // "inicio" se abre por default para que Chat IA sea visible de entrada.
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(() => new Set(["inicio"]));

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

  /* Colores por categoría — le dan personalidad al sidebar sin saturar.
     Si iconStyle = "monochrome" → todos grises. Si "colored" → por categoría. */
  const isDarkTheme = sidebarTheme === "cristal" || sidebarTheme === "dark" || sidebarTheme === "shaded" || sidebarTheme === "buleje";
  const MONOCHROME_ICON_COLOR = isDarkTheme ? "text-white/60" : "text-[var(--text-tertiary)]";
  const ICON_COLORS_COLORED: Record<string, string> = isDarkTheme
    ? {
        dashboard: "text-primary/90",
        ventas: "text-sky-300/90",
        productos: "text-[var(--accent)]/90",
        inventario: "text-amber-300/90",
        compras: "text-orange-300/90",
        finanzas: "text-emerald-300/90",
        clientes: "text-[var(--data-error-500)]/90",
        "marketplace-ops": "text-fuchsia-300/90",
        analytics: "text-cyan-300/90",
        comunicacion: "text-teal-300/90",
        documentos: "text-slate-300/90",
        "mi-tienda": "text-pink-300/90",
        metas: "text-yellow-300/90",
      }
    : {
        dashboard: "text-primary",
        ventas: "text-sky-600",
        productos: "text-[var(--accent)]",
        inventario: "text-[var(--data-warning-600)]",
        compras: "text-orange-600",
        finanzas: "text-[var(--data-success-600)]",
        clientes: "text-[var(--data-error-500)]",
        "marketplace-ops": "text-fuchsia-600",
        analytics: "text-cyan-600",
        comunicacion: "text-[var(--accent-dark)]",
        documentos: "text-slate-600",
        "mi-tienda": "text-pink-600",
        metas: "text-yellow-600",
      };

  const ICON_COLORS: Record<string, string> =
    iconStyle === "colored"
      ? ICON_COLORS_COLORED
      : Object.fromEntries(Object.keys(ICON_COLORS_COLORED).map((k) => [k, MONOCHROME_ICON_COLOR]));

  // Density → paddings dinámicos
  const densityPad = density === "compact" ? "px-2.5 py-1.5" : density === "spacious" ? "px-3 py-3" : "px-3 py-2.5";
  const densityGap = density === "compact" ? "gap-2" : density === "spacious" ? "gap-3.5" : "gap-3";

  /* Accent color → active bar hex (para drop-shadow glow).
     Los classes Tailwind con arbitrary values aceptan hex literal. */
  const ACCENT_HEX: Record<AccentColor, string> = {
    teal:    "var(--accent)",
    emerald: "#10B981",
    sky:     "#0EA5E9",
    violet:  "#8B5CF6",
    amber:   "#F59E0B",
    rose:    "#F43F5E",
  };
  const accentHex = ACCENT_HEX[accent];
  const accentBarStyle: React.CSSProperties = {
    background: accentHex,
    boxShadow: `0 0 8px ${accentHex}80`,
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
      {/* Desktop permanent sidebar — siempre desde top:0 para abarcar
          toda la altura. Banner de impersonation fue removido. */}
      <aside
        className={cn(
          "hidden md:flex fixed top-0 bottom-0 z-40 flex-col transition-all duration-[var(--dur-base)] ease-in-out overflow-hidden border-r",
          themeClasses.bg,
          themeClasses.border,
          effectiveCompact ? "w-[60px]" : "w-[260px]",
          presentationMode && "hidden!"
        )}
        style={{
          /* Cuando configMode activo, el sidebar real se mueve a la derecha del
             panel de configuración para que el usuario vea naturalmente de
             izquierda → derecha: edita en el Configurator y el resultado aparece
             inmediatamente al lado. */
          left: configMode && !effectiveCompact ? 400 : 0,
        }}
      >
        {/* ── Header: tenant + user ── */}
        {/* Sidebar content SIEMPRE visible (incluso en configMode — el
            configurator ahora se muestra en panel separado al lado) */}
        <>
        <div className={cn(
          "flex items-center gap-3 h-16 border-b transition-all duration-[var(--dur-base)] shrink-0",
          themeClasses.headerBorder,
          effectiveCompact ? "px-3 justify-center" : "px-4"
        )}>
          {activeTenantLogo ? (
            <div className={cn(
              "relative shrink-0",
              isDarkTheme && "drop-shadow-[0_0_12px_color-mix(in oklab, var(--accent) 25%, transparent)]"
            )}>
              <Image
                src={activeTenantLogo}
                alt={activeTenantName ?? "Logo"}
                width={40}
                height={40}
                className={cn(
                  "h-10 w-10 rounded-xl object-cover",
                  isDarkTheme
                    ? "ring-1 ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]"
                    : "ring-2 ring-gray-100 dark:ring-card-border",
                )}
              />
            </div>
          ) : (
            <div className={cn(
              "relative h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              isDarkTheme
                ? "bg-linear-to-br from-[color-mix(in_oklab,var(--accent)_42%,transparent)] to-[color-mix(in_oklab,var(--accent)_8%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--accent)_50%,transparent)] text-[color-mix(in_oklab,var(--accent)_70%,white)] shadow-[0_0_16px_-2px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
                : "bg-linear-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 text-primary",
            )}>
              <BulejeMark size={22} strokeWidth={1.75} />
            </div>
          )}
          {!effectiveCompact && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={cn(
                  "font-bold text-sm leading-tight tracking-tight truncate flex-1 min-w-0",
                  isDarkTheme
                    ? "text-white"
                    : "text-[var(--text-primary)] dark:text-[var(--text-primary)]",
                )}>
                  {verticalConfig.branding?.sidebarTitle ?? activeTenantName ?? "Buleje"}
                </p>
                {/* Industry badge — clickable para owner/admin */}
                <button
                  onClick={() => canChangeIndustry && setShowIndustryModal(true)}
                  title={canChangeIndustry ? "Cambiar tipo de negocio" : verticalConfig.label}
                  className={cn(
                    "shrink-0 text-[length:var(--ts-2xs)] font-semibold px-1.5 py-0.5 rounded-md leading-none transition-all",
                    isDarkTheme
                      ? "bg-[color-mix(in_oklab,var(--accent)_20%,transparent)] text-[color-mix(in_oklab,var(--accent)_70%,white)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]"
                      : "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
                    canChangeIndustry && "cursor-pointer hover:opacity-80",
                    !canChangeIndustry && "cursor-default"
                  )}
                >
                  {verticalConfig.label}
                </button>
              </div>
              <p className="flex items-center gap-1.5 mt-1 leading-none">
                <span className={cn(
                  "capitalize text-[length:var(--ts-2xs)] truncate",
                  isDarkTheme ? "text-white/55" : "text-[var(--text-tertiary)] dark:text-muted"
                )}>
                  {userName}
                </span>
                <span className={cn(
                  "uppercase text-[length:var(--ts-2xs)] font-bold tracking-wider px-1.5 py-px rounded shrink-0",
                  isDarkTheme
                    ? "bg-[color-mix(in oklab, var(--accent) 14%, transparent)] text-[color-mix(in oklab, var(--accent) 60%, white)] ring-1 ring-inset ring-[color-mix(in oklab, var(--accent) 25%, transparent)]"
                    : "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                )}>
                  {userRole}
                </span>
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
            // 1. Filtros previos (RBAC + hidden user + template)
            const rbacFiltered = category.tabs.filter(
              t =>
                allowedTabs.includes(t as Tab) &&
                !hiddenTabs.has(t as Tab) &&
                !hiddenSubTabs.has(t as Tab) &&
                !isHiddenByTemplate(t),
            );
            // 2. Filtro vertical (industry)
            const { visible: verticalVisible, comingSoon: catComingSoon } = applyVerticalFilter(rbacFiltered);
            const catTabs = verticalVisible;
            // comingSoon items for this category (shown disabled)
            const catComingSoonItems = catComingSoon;

            if (catTabs.length === 0 && catComingSoonItems.length === 0) return null;
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

            // Resolve display info — aplica label custom de la plantilla
            const displayLabel = isSingleTab
              ? resolveLabel(catTabs[0], allTabs.find(t => t.id === catTabs[0])?.label ?? category.label)
              : resolveLabel(category.id, category.label);
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
                      className="w-full flex items-center gap-1.5 px-3 mt-4 mb-1.5 group/section"
                    >
                      <ChevronDown className={cn(
                        "h-3 w-3 transition-transform duration-[var(--dur-base)]",
                        isDarkTheme ? "text-[rgba(94,234,212,0.5)]" : "text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]",
                        isSectionCollapsed && "-rotate-90"
                      )} />
                      <span className={cn(
                        "text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest transition-colors",
                        isDarkTheme
                          ? "text-[rgba(94,234,212,0.6)] group-hover/section:text-[color-mix(in oklab, var(--accent) 60%, white)]"
                          : "text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]"
                      )}>
                        {sectionLabel}
                      </span>
                      <span className={cn(
                        "flex-1 ml-2 h-px",
                        isDarkTheme
                          ? "bg-linear-to-r from-[color-mix(in oklab, var(--accent) 18%, transparent)] to-transparent"
                          : "bg-linear-to-r from-[var(--rule-soft)] to-transparent"
                      )} />
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
                        "group relative w-full flex items-center rounded-lg text-[length:var(--ts-sm)] font-medium transition-all duration-[var(--dur-fast)] mb-px",
                        densityPad,
                        densityGap,
                        isActive
                          ? cn(themeClasses.activeItem, isDarkTheme ? "text-white font-semibold" : "text-[var(--text-primary)] font-semibold")
                          : cn(themeClasses.text, themeClasses.hover, isDarkTheme ? "hover:text-white" : "hover:text-[var(--text-primary)] dark:hover:text-gray-200")
                      )}
                    >
                      {/* Active indicator bar — gradient inset bar with accent glow */}
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                          style={accentBarStyle}
                        />
                      )}

                      <DisplayIcon className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-all duration-[var(--dur-base)] group-hover:scale-110",
                        isActive
                          ? (isDarkTheme ? "text-[color-mix(in oklab, var(--accent) 60%, white)] drop-shadow-[0_0_6px_color-mix(in oklab, var(--accent) 50%, transparent)]" : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]")
                          : iconColor
                      )} />

                      <span className="truncate flex-1 text-left">{displayLabel}</span>

                      {totalAlerts > 0 && (
                        <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error-500)] text-white leading-none animate-pulse">
                          {totalAlerts}
                        </span>
                      )}

                      {!isSingleTab && (
                        <m.div
                          animate={{ rotate: expandedCategories.has(category.id) ? 90 : 0 }}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        >
                          <ChevronRight className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-colors",
                            isActive
                              ? (isDarkTheme ? "text-[color-mix(in oklab, var(--accent) 60%, white)]" : "text-[var(--data-success-500)]")
                              : (isDarkTheme ? "text-white/35 group-hover:text-white/60" : "text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] group-hover:text-[var(--text-tertiary)]")
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
                              const subTabLabel = resolveLabel(subTabId, subTabInfo.label);
                              const isSubActive = tab === subTabId;
                              const subAlertCount = alerts[subTabId] ?? 0;
                              const isFeaturedSub = verticalFeaturedSet.has(subTabId);
                              return (
                                <button
                                  key={subTabId}
                                  onClick={() => navigateTab(subTabId as Tab)}
                                  className={cn(
                                    "group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[length:var(--ts-sm)] transition-all",
                                    isSubActive
                                      ? cn(themeClasses.activeItem, isDarkTheme ? "text-white font-semibold" : "text-[var(--text-primary)] font-semibold")
                                      : cn(themeClasses.text, themeClasses.hover, "font-medium")
                                  )}
                                >
                                  {isSubActive && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full" style={accentBarStyle} />
                                  )}
                                  <SubIcon className={cn(
                                    "h-4 w-4 shrink-0 transition-transform duration-[var(--dur-base)] group-hover:scale-110",
                                    isSubActive
                                      ? (isDarkTheme ? "text-[color-mix(in oklab, var(--accent) 60%, white)]" : "text-[var(--data-success-500)]")
                                      : (isDarkTheme ? "text-white/45" : "text-[var(--text-tertiary)]")
                                  )} />
                                  <span className="truncate">{subTabLabel}</span>
                                  {isFeaturedSub && subAlertCount === 0 && subTabId !== "asistente-ia" && (
                                    <span className="ml-auto shrink-0 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-md bg-[var(--data-warning-500)]/20 text-[var(--data-warning-700)] dark:text-[var(--data-warning-400)] leading-none">
                                      Destacado
                                    </span>
                                  )}
                                  {subTabId === "asistente-ia" && subAlertCount === 0 && (
                                    <span className="ml-auto shrink-0 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground leading-none">
                                      Nuevo
                                    </span>
                                  )}
                                  {subAlertCount > 0 && (
                                    <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error-500)] text-white leading-none ml-auto animate-pulse">
                                      {subAlertCount}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                            {/* ── comingSoon items (vertical filter) ── */}
                            {catComingSoonItems.map(comingTabId => {
                              const comingTabInfo = allTabs.find(t => t.id === comingTabId);
                              const label = comingTabInfo ? resolveLabel(comingTabId, comingTabInfo.label) : comingTabId;
                              const ComingIcon = comingTabInfo?.icon;
                              return (
                                <div
                                  key={`coming-${comingTabId}`}
                                  className={cn(
                                    "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[length:var(--ts-sm)] opacity-50 cursor-not-allowed select-none",
                                    themeClasses.text
                                  )}
                                  title="Modulo proximento disponible"
                                >
                                  {ComingIcon && <ComingIcon className="h-4 w-4 shrink-0" />}
                                  <span className="truncate">{label}</span>
                                  <span className="ml-auto shrink-0 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-md bg-[var(--text-tertiary)]/15 text-[var(--text-tertiary)] leading-none">
                                    Pronto
                                  </span>
                                </div>
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
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--accent)] shadow-[0_0_8px_color-mix(in_oklab,var(--accent)_60%,transparent)]" />
                )}
                <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-[var(--dur-base)] group-hover:scale-110", tab === id ? "text-[var(--data-success-500)]" : "")} />
                <span className="truncate flex-1 text-left">{label}</span>
                {alertCount > 0 && (
                  <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error-500)] text-white leading-none animate-pulse">
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
                    <span className="absolute top-1 right-1 text-[length:var(--ts-2xs)] font-bold rounded-full w-4 h-4 flex items-center justify-center bg-[var(--data-error-500)] text-white leading-none animate-pulse">
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
          {/* Quick links: Ver tiendas (lista) + Ver mi tienda (storefront real) */}
          <Link
            href="/tiendas"
            target="_blank"
            rel="noopener noreferrer"
            title={effectiveCompact ? "Ver tiendas (nueva pestaña)" : "Abre la lista de tiendas en una pestaña nueva"}
            className={cn(
              "flex items-center rounded-lg text-[length:var(--ts-sm)] font-medium transition-all",
              themeClasses.text, themeClasses.hover,
              effectiveCompact ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
            )}
          >
            <Globe className="h-[18px] w-[18px] shrink-0" /> {!effectiveCompact && "Ver tiendas ↗"}
          </Link>
          {isRealTenant && (
            <Link
              href={storeHref}
              target="_blank"
              rel="noopener noreferrer"
              title={effectiveCompact ? "Ver mi tienda (nueva pestaña)" : "Abre tu storefront público en una pestaña nueva"}
              className={cn(
                "flex items-center rounded-lg text-[length:var(--ts-sm)] font-medium transition-all",
                themeClasses.text, themeClasses.hover,
                effectiveCompact ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
              )}
            >
              <Store className="h-[18px] w-[18px] shrink-0" /> {!effectiveCompact && "Ver mi tienda ↗"}
            </Link>
          )}

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
                onClick={openConfig}
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
              onClick={openConfig}
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
        </>
      </aside>

      {/* ── Configurator panel — al inicio (left: 0), sidebar real al lado.
          Orden natural: usuario edita aquí ← y ve el resultado aquí →. */}
      {configMode && !effectiveCompact && !presentationMode && (
        <aside
          className={cn(
            "hidden md:flex fixed top-0 bottom-0 z-50 flex-col overflow-hidden border-r shadow-2xl",
            themeClasses.border,
          )}
          style={{ left: 0, width: 400 }}
          aria-label="Configuración de barra lateral"
        >
          <SidebarConfigurator
            allCategories={TAB_CATEGORIES}
            hiddenCategories={hiddenCategories}
            hiddenSubTabs={hiddenSubTabs}
            categoryOrder={categoryOrder}
            theme={sidebarTheme}
            accent={accent}
            density={density}
            iconStyle={iconStyle}
            applyToHeader={applyToHeader}
            allTabs={allTabs}
            allowedTabs={allowedTabs}
            onSave={handleConfigSave}
            onCancel={handleConfigCancel}
            onLiveDraftChange={handleLiveDraft}
          />
        </aside>
      )}

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
        const catTabs = cat.tabs.filter(t => allowedTabs.includes(t as Tab) && !isHiddenByTemplate(t));
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
            className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl py-2 w-60 max-h-[80vh] overflow-y-auto"
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
                      : "text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-surface font-medium"
                  )}
                >
                  <FlyoutTabIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{resolveLabel(tabId, tabInfo.label)}</span>
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
          t => allowedTabs.includes(t as Tab) && !hiddenTabs.has(t as Tab) && !isHiddenByTemplate(t)
        );
        if (catTabs.length <= 1) return null;
        const flyoutTabs = catTabs
          .map(tId => allTabs.find(t => t.id === tId))
          .filter((t): t is typeof allTabs[number] => t != null)
          .map(t => ({ id: t.id as string, label: resolveLabel(t.id, t.label), icon: t.icon as React.ComponentType<{ className?: string }> }));
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

      {/* ── Modal: Cambiar tipo de negocio ──────────────────────────────────── */}
      {showIndustryModal && canChangeIndustry && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowIndustryModal(false)}
        >
          <div
            className="bg-[var(--surface-raised)] rounded-2xl shadow-2xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">
              Tipo de negocio
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              El tipo de negocio determina que modulos aparecen en tu panel.
            </p>
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-xl mb-4",
              isDarkTheme
                ? "bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]"
                : "bg-primary/5 ring-1 ring-primary/15"
            )}>
              <div>
                <p className="font-semibold text-sm text-[var(--text-primary)]">{verticalConfig.label}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{verticalConfig.description}</p>
              </div>
            </div>
            <Link
              href="/admin?tab=config&section=industry"
              onClick={() => setShowIndustryModal(false)}
              className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Cambiar tipo de negocio
            </Link>
            <button
              onClick={() => setShowIndustryModal(false)}
              className="mt-2 w-full text-center text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors py-1.5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
