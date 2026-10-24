"use client";

import React from "react";
import Link from "next/link";
import { m } from "@/components/admin/providers";
import { ChevronRight, Store } from "lucide-react";
import { cn } from "@/lib/utils";
// resolveSessionStorefrontTarget removed — use activeTenantSlug directly
import { useModuleTabs } from "@/contexts/module-tabs-context";
import { useCamarasAcopladas } from "@/hooks/use-camaras-acopladas";
import { useAdminTemplateOverlay } from "@/app/admin/_hooks/useAdminTemplateOverlay";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { preloadTab } from "@/app/admin/_lib/tab-preload";
import { SECTION_BEFORE, type TabCategory } from "@/app/admin/_lib/tab-categories";
import { MODULE_INFO, TAB_CATEGORIES } from "@/app/admin/_lib/tab-categories";
import { useEnabledSpecs } from "@/hooks/use-enabled-specs";
import { PillPronto, SidebarFlyout } from "@/components/admin/shared/SidebarFlyout";
import SidebarConfigurator from "@/components/admin/shared/SidebarConfigurator";
import type { SidebarTheme, AccentColor, Density, IconStyle, SidebarExtendedConfig } from "@/components/admin/shared/SidebarConfigurator";
import { gruposDeEnlaces, guardarModoMenu, leerModoMenu, type ModoMenu } from "@/components/admin/layout/sidebar-enlaces";
import { SidebarEnlacesSueltos } from "@/components/admin/layout/SidebarEnlacesSueltos";
import { coloresDeIconos } from "@/components/admin/layout/sidebar-colores-iconos";
import { COLOR_DE_ACENTO, DENSIDADES, estiloDeTema, guardarTema, leerTema } from "@/components/admin/layout/sidebar-temas";
import { PieDeBarra } from "@/components/admin/layout/PieDeBarra";
import { BotonCabecera } from "@/components/admin/layout/BotonCabecera";
import { TiradorAncho } from "@/components/admin/layout/TiradorAncho";
import { BulejeMark, BulejeWordmark } from "@/components/ui-system/illustrations";
import { useTenant } from "@/contexts/tenant-context";
import { SIDEBAR_STYLE_PRESETS, type DefaultSidebarStyle } from "@/lib/admin-template";
import { ScopeBadge } from "@/components/admin/layout/ScopeBadge";
import {
  getVerticalConfig,
  type Industry,
} from "@/lib/verticals/registry";
import {
  estadoDePestana,
  normalizarOcultas,
  rubroDelPanel,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";

// "Ver mi tienda" (storefront público) oculto por defecto — pedido Brandon
// 2026-05-29: en la barra solo queda "Ver tiendas" (lista del marketplace).
// Cambiar a true para reactivar el link al storefront propio.
const SHOW_MI_TIENDA_LINK = false;

/** Última plantilla del superadmin ya aplicada a este navegador (2026-10-20). */
const CLAVE_PLANTILLA_APLICADA = "admin-sidebar-plantilla-aplicada";

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
  activeTenantSlug: string | null | undefined;
  userName: string;
  userRole: string;

  // Tab state
  tab: Tab;
  navigateTab: (tab: Tab) => void;
  allowedTabs: Tab[];
  visibleCategories: TabCategory[];

  // Accordion
  openAccordionCategories: Set<string>;
  onToggleAccordion: (categoryId: string) => void;

  // Flyout (sidebar colapsado hover)
  sidebarFlyout: { categoryId: string; top: number } | null;
  onSidebarFlyoutChange: (flyout: { categoryId: string; top: number } | null) => void;
  flyoutTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;

  // Favoritos (el bloque "Recientes" salió del sidebar — Brandon 2026-08-02;
  // el drawer mobile lo conserva, por eso los props siguen existiendo aguas
  // arriba pero ya no llegan hasta acá).
  favoriteTabItems: TabItem[];
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

  // Modo fácil / avanzado
  isEasyMode?: boolean;
  onToggleAdminMode?: () => void;

  // ALL_TABS necesario para resolver el accordion (readonly porque viene de const as const)
  allTabs: readonly TabItem[];
};

// ─── Componente ───────────────────────────────────────────────────────────────
// Memoizado: sin esto, re-renderiza entero (133 tabs + categorías + búsqueda)
// en CUALQUIER cambio de estado de AdminPage — incluidos los polls de 60s de
// alertas/webhooks — porque `AdminPage` no lo aisla. Sólo sirve si las props
// que le llegan son estables (ver `sharedNav`/`sidebarNav` en page.tsx).
export const AdminSidebar = React.memo(function AdminSidebar({
  focusMode,
  presentationMode,
  activeTenantSlug,
  userName: _userName,
  userRole: _userRole,
  tab,
  navigateTab,
  allowedTabs,
  visibleCategories,
  openAccordionCategories: _openAccordionCategories,
  onToggleAccordion: _onToggleAccordion,
  sidebarFlyout,
  onSidebarFlyoutChange,
  flyoutTimerRef,
  favoriteTabItems: _favoriteTabItems,
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
  const verticalFeaturedSet = React.useMemo(
    () => new Set(verticalConfig.modules.featured.map(String)),
    [verticalConfig],
  );
  // Habilitados, ocultos y «Pronto» del tipo de negocio, como capa del permiso.
  const rubro = React.useMemo(() => rubroDelPanel(industry), [industry]);

  // Especializaciones habilitadas para el tenant (ADR-124). El gating real de
  // los tabs spec-gated (cacao, forestal, salud…) lo hace este feature flag:
  // son ORTOGONALES al tipo de negocio (se saltan rubro, plan y plantilla) y sólo
  // aparecen si su spec está prendida (2026-05-29: antes seguían visibles aunque
  // el superadmin la apagara).
  const { enabledModuleIds: enabledSpecModuleIds } = useEnabledSpecs();

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
  const { resolveLabel, isHiddenByTemplate, template } = useAdminTemplateOverlay();

  // Diseño guardado: la clave vieja trae la familia (la lee la barra superior) y
  // la variante aparte (Mínimo/Bosque/Noche/Vibrante) — ver sidebar-temas.ts.
  const [sidebarTheme, setSidebarTheme] = React.useState<SidebarTheme>(() =>
    typeof window === "undefined" ? "buleje" : leerTema(),
  );

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

  // ── Forma del menú: por categorías o todos los enlaces a la vista (persisted) ──
  const [navMode, setNavMode] = React.useState<ModoMenu>(leerModoMenu);

  // Propagar apply-to-header + accent al header via evento
  React.useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("admin-sidebar-theming-change", {
          detail: { applyToHeader, theme: estiloDeTema(sidebarTheme).familia, accent },
        }),
      );
    } catch { /* ignore */ }
  }, [applyToHeader, sidebarTheme, accent]);

  // ── Estilo default del sidebar heredado del superadmin (plantilla) ──
  // El superadmin elige en /superadmin/plantilla un estilo (buleje / ejecutivo
  // / sereno / vibrante / personalizado). El admin SIEMPRE refleja lo que el
  // superadmin guardó — sin excepciones — para evitar drift visual entre las
  // dos vistas.
  //
  // Brandon 2026-05-16: antes "personalizado" hacía `return` y dejaba el
  // sidebar con lo que tuviera en localStorage (casi siempre "buleje"). Eso
  // provocaba que superadmin mostrara "Personalizado" seleccionado pero admin
  // se viera "Estilo Buleje". Ahora "personalizado" mapea al preset buleje
  // como base — el cliente puede ajustar después desde el panel admin.
  //
  // 2026-10-20: «puede ajustar después» no se cumplía — el efecto corría en
  // CADA montaje y pisaba el diseño que el dueño eligió en «Personaliza tu
  // navegación» (medido: Sereno guardado → recarga → Ejecutivo). Ahora la
  // plantilla se aplica cuando CAMBIA (la última aplicada queda anotada):
  // lo que el superadmin cambie sigue llegando, y lo que el dueño elija después
  // sobrevive a la recarga.
  React.useEffect(() => {
    const style = template.defaultSidebarStyle ?? "buleje";
    const presetKey = (style === "personalizado" ? "buleje" : style) as Exclude<DefaultSidebarStyle, "personalizado">;
    const preset = SIDEBAR_STYLE_PRESETS[presetKey];
    if (!preset) return;
    try {
      if (localStorage.getItem(CLAVE_PLANTILLA_APLICADA) === style) return;
      localStorage.setItem(CLAVE_PLANTILLA_APLICADA, style);
    } catch { /* sin almacenamiento: se aplica igual */ }
    if (sidebarTheme !== preset.theme) {
      setSidebarTheme(preset.theme);
      guardarTema(preset.theme);
    }
    if (accent !== preset.accent) {
      setAccent(preset.accent);
      try { localStorage.setItem("admin-sidebar-accent", preset.accent); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reaccionamos a cambios del template
  }, [template.defaultSidebarStyle]);

  // ── Sincronizar --accent en :root cuando cambia el accent local ──
  // El sidebar (y el shell entero) usa var(--accent) masivamente. Cambiar
  // solo el state interno no muta la variable CSS, así que el "ejecutivo"
  // ámbar solo se veía en la barra activa pero no en bordes/halos. Idéntico
  // patrón a SuperAdminShell:317 — un solo punto de verdad para tinte.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const hex = COLOR_DE_ACENTO[accent];
    // teal usa el accent original del tema → limpiar overrides para que
    // herede del theme global; las otras opciones sobreescriben.
    if (accent === "teal") {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-soft");
      root.style.removeProperty("--accent-600");
    } else {
      root.style.setProperty("--accent", hex);
      root.style.setProperty("--accent-soft", `${hex}26`);
      root.style.setProperty("--accent-600", hex);
    }
  }, [accent]);

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
      // Sólo los que siguen siendo pestaña: un id viejo no sigue su alias (ver
      // `normalizarOcultas`, plan «panel unificado»).
      if (stored) return normalizarOcultas(JSON.parse(stored) as Tab[], new Set<string>(allTabs.map((t) => t.id)));
    } catch { /* ignore */ }
    return new Set();
  });

  /**
   * Las capas del permiso de la barra de escritorio (`lib/admin/permiso-vista.ts`).
   * `allowedTabs` ya trae rol + plan POR ID (useAdminTabsDerived), así que va
   * como capa de rol y el plan no se vuelve a mirar. Encima: plantilla, tipo de
   * negocio y especialización. Una pestaña sale si ALGUNA de sus vistas pasa,
   * cada una evaluada sobre la pestaña de donde vino (regla R2 del plan).
   */
  const capaBarra = React.useMemo<ContextoPermiso>(
    () => ({
      rol: new Set<string>(allowedTabs),
      plan: null,
      plantilla: isHiddenByTemplate,
      rubro,
      especialidades: enabledSpecModuleIds,
      modoFacil: null,
    }),
    [allowedTabs, isHiddenByTemplate, rubro, enabledSpecModuleIds],
  );

  /**
   * Qué tabs de una categoría se ven y cuáles salen como «Pronto». UNA fuente
   * para el menú desplegado, los íconos del compacto y los dos flyouts.
   *
   * Brandon 2026-09-28: «pon lo mismo en el menú que el desplegable… no me deja
   * ir a títulos habilitantes». Cada lista filtraba distinto: los flyouts sólo
   * miraban permisos y plantilla, así que ofrecían un libro con su
   * especialización apagada (el acordeón ya no lo mostraba) y el clic no llevaba
   * a ninguna parte. Tampoco respetaban los ocultos del usuario ni el tipo de
   * negocio.
   */
  const tabsDeCategoria = React.useCallback(
    (category: { tabs: readonly string[] }) => {
      const visible: string[] = [];
      const comingSoon: string[] = [];
      for (const t of category.tabs) {
        if (hiddenTabs.has(t as Tab) || hiddenSubTabs.has(t as Tab)) continue;
        const estado = estadoDePestana(capaBarra, t);
        if (estado === "visible") visible.push(t);
        else if (estado === "pronto") comingSoon.push(t);
      }
      return { visible, comingSoon };
    },
    [capaBarra, hiddenTabs, hiddenSubTabs],
  );

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
  const [configSnapshot, setConfigSnapshot] = React.useState<SidebarExtendedConfig | null>(null);

  /* Live preview: cada cambio en el Configurator se aplica inmediatamente
     al sidebar (para que el usuario vea cómo queda). Si cancela, usamos
     el snapshot para revertir. Si guarda, persistimos a localStorage. */
  const handleLiveDraft = React.useCallback((draft: SidebarExtendedConfig) => {
    setHiddenCategories(draft.hiddenCategories);
    setHiddenSubTabs(draft.hiddenSubTabs);
    setCategoryOrder(draft.categoryOrder);
    setSidebarTheme(draft.theme);
    setAccent(draft.accent);
    setDensity(draft.density);
    setIconStyle(draft.iconStyle);
    setApplyToHeader(draft.applyToHeader);
    setNavMode(draft.navMode);
  }, []);

  const handleConfigSave = React.useCallback((config: SidebarExtendedConfig) => {
    /* Live preview ya aplicó los cambios al state; aquí solo persistimos. */
    try {
      localStorage.setItem("admin-sidebar-hidden", JSON.stringify([...config.hiddenCategories]));
      localStorage.setItem("admin-sidebar-hidden-tabs", JSON.stringify([...config.hiddenSubTabs]));
      localStorage.setItem("admin-sidebar-order", JSON.stringify(config.categoryOrder));
      localStorage.setItem("admin-sidebar-accent", config.accent);
      localStorage.setItem("admin-sidebar-density", config.density);
      localStorage.setItem("admin-sidebar-icon-style", config.iconStyle);
      localStorage.setItem("admin-sidebar-apply-to-header", config.applyToHeader ? "true" : "false");
    } catch { /* ignore */ }
    guardarTema(config.theme);
    guardarModoMenu(config.navMode);
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
      navMode,
    });
    setConfigModeSynced(true);
  }, [sidebarTheme, accent, density, iconStyle, applyToHeader, hiddenCategories, hiddenSubTabs, categoryOrder, navMode, setConfigModeSynced]);

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
      setNavMode(configSnapshot.navMode);
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

  // ── Modo "suelto" vs categorizado (Brandon 2026-05-29) ──────────────────
  // Siempre se navega POR CATEGORÍA. Había una rama "plana" que, por debajo de
  // 15 módulos visibles, reemplazaba las categorías por pseudo-categorías
  // `flat:<tab>` de un solo tab. Como los encabezados de sección se anclan al
  // id de la categoría real, con esa rama activa NINGÚN encabezado matcheaba:
  // el menú quedaba en 21 enlaces sueltos, sin un solo agrupador (medido en el
  // DOM: 0 encabezados). No hacía falta: una categoría con un solo tab visible
  // ya se dibuja como enlace directo más abajo, así que los tenants chicos
  // siguen viendo enlaces sueltos — pero ahora bajo su sección.
  const navCategories = orderedVisibleCategories;
  // «Sin categorías» (2026-10-20): las MISMAS categorías y la misma regla
  // (`tabsDeCategoria`), sin acordeón ni pseudo-categorías.
  const gruposSueltos = React.useMemo(
    () => (navMode === "enlaces" ? gruposDeEnlaces(navCategories, tabsDeCategoria, (id) => id in SECTION_BEFORE) : []),
    [navMode, navCategories, tabsDeCategoria],
  );

  /* Clases de cada diseño en un solo mapa (sidebar-temas.ts): fondo, texto,
     hover, activo con su texto, íconos y chevrons. Antes eran 20 ternarios
     `isDarkTheme ? … : …` y un tema nuevo no tenía dónde entrar. */
  const themeClasses = estiloDeTema(sidebarTheme);

  // ── Compact mode toggle (persisted in localStorage) ──
  const [isCompact, setIsCompact] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("admin-sidebar-compact") === "true";
    } catch { return false; }
  });

  // Los efectos (localStorage + evento) van FUERA del updater de setState.
  // Estaban adentro y React ejecuta los updaters en fase de render: el
  // dispatchEvent corría durante el render de AdminSidebar, el listener de
  // AdminPage lo atendía sincrónicamente y llamaba setSidebarCompact →
  // "Cannot update a component (AdminPage) while rendering a different
  // component (AdminSidebar)". Un updater tiene que ser puro.
  const toggleCompact = React.useCallback(() => {
    const next = !isCompact;
    setIsCompact(next);
    try {
      localStorage.setItem("admin-sidebar-compact", next ? "true" : "false");
      /* Evento custom para que el layout principal reajuste el margin del
         main de inmediato (sin esperar el polling de 500ms). */
      window.dispatchEvent(new CustomEvent("admin-sidebar-compact-change", { detail: { compact: next } }));
    } catch { /* ignore */ }
  }, [isCompact]);

  // Brandon 2026-07-22: se quitó el auto-colapso por ancho (<1024px). Debajo de
  // ese umbral el menú se reducía SOLO a íconos —sin etiquetas, imposible de
  // leer para quien no se sabe los símbolos de memoria— justo en las
  // resoluciones de laptop más comunes y en cualquier pantalla con zoom del
  // navegador. Además el shell reservaba 260px para ese sidebar de 60px, así
  // que el contenido quedaba corrido con 200px muertos al costado.
  // Ahora el modo compacto es SIEMPRE una decisión del usuario (el toggle del
  // pie del sidebar, que se recuerda en localStorage) o del modo foco.
  // Debajo de 768px no hay sidebar fijo: ahí manda el menú móvil.
  // Brandon 2026-10-09: con las cámaras «al lado» la barra se encoge a íconos
  // mientras dure (pedido explícito: el formulario de al lado ganaba 216 px) y
  // vuelve sola al desacoplar. El toggle del usuario no se toca.
  const camarasAcopladas = useCamarasAcopladas();
  const effectiveCompact = focusMode || isCompact || camarasAcopladas;

  // Track which multi-tab categories are expanded (shows sub-tabs).
  // Acordeón ESTRICTO (single-open): solo 1 categoría abierta a la vez.
  // Brandon 2026-06-14: el acordeón sigue al tab activo — al elegir un sub-tab
  // (ej. Ventas → Pedidos) su categoría padre se despliega sola y las demás se
  // minimizan; el toggle manual por click se mantiene. (ver effect abajo).
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(() => new Set());

  // ── Auto-despliegue de la categoría del tab activo (Brandon 2026-06-14) ──
  // Cuando cambia el tab activo, abrimos SU categoría (si es multi-tab) y
  // cerramos el resto. Las categorías de 1 solo enlace (single-tab/directas)
  // no participan: son links directos sin panel. Guard de igualdad evita
  // renders extra cuando ya está la correcta abierta.
  React.useEffect(() => {
    const activeCat = navCategories.find(
      (c) => c.tabs.length > 1 && (c.tabs as readonly string[]).includes(tab as string),
    );
    if (activeCat) {
      setExpandedCategories((prev) =>
        prev.size === 1 && prev.has(activeCat.id) ? prev : new Set([activeCat.id]),
      );
    }
  }, [tab, navCategories]);

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

  const isDarkTheme = themeClasses.oscuro;
  // Colores por categoría (o todos en un tono si iconStyle = "monochrome").
  const ICON_COLORS = coloresDeIconos(isDarkTheme, iconStyle);

  // Densidad → alto de fila Y separación entre filas (sidebar-temas.ts).
  const densidad = DENSIDADES[density];
  const densityPad = densidad.fila;
  const densityGap = densidad.gap;

  /* El acento elegido se acota a la barra (y a sus menús flotantes): un
     envoltorio del panel fija su propio `--accent` (el de la marca) y tapaba el
     de :root, así que elegir «Coral» o «Violeta» no cambiaba la barra (medido
     2026-10-20: aside → #00A29C con «amber» guardado). */
  const estiloAcento = (accent === "teal" ? {} : { "--accent": COLOR_DE_ACENTO[accent] }) as React.CSSProperties;
  /* Rayita del activo. Antes el halo era `${hex}80` y con teal quedaba
     «var(--accent)80» — una sombra inválida que el navegador descartaba. */
  const accentBarStyle: React.CSSProperties = {
    background: "var(--accent)",
    boxShadow: themeClasses.barraBrillo ? "0 0 8px color-mix(in oklab, var(--accent) 50%, transparent)" : undefined,
  };

  // Section headers keyed by the first category id in each group

  return (
    <>
      {/* Desktop permanent sidebar — siempre desde top:0 para abarcar
          toda la altura. Banner de impersonation fue removido. */}
      <aside
        data-barra-lateral
        className={cn(
          // `group/barra`: el pie (Compactar/Configurar) aparece con el mouse o el foco adentro.
          "group/barra hidden md:flex fixed top-0 bottom-0 z-40 flex-col transition-all duration-[var(--dur-base)] ease-in-out overflow-hidden border-r",
          themeClasses.bg,
          themeClasses.border,
          /* Anchos desde los tokens del shell (globals.css §PANEL SHELL):
             el margen del contenido en app/admin/page.tsx lee LOS MISMOS, así
             que sidebar y contenido no pueden desincronizarse. Crece a
             296/312px en monitores ≥2100px — los labels de los 133 tabs
             dejaban de entrar y se truncaban. */
          effectiveCompact ? "w-[var(--admin-sidebar-w-compact,60px)]" : "w-[var(--admin-sidebar-w,276px)]",
          presentationMode && "hidden!"
        )}
        style={{
          ...estiloAcento,
          /* Cuando configMode activo, el sidebar real se mueve a la derecha del
             panel de configuración para que el usuario vea naturalmente de
             izquierda → derecha: edita en el Configurator y el resultado aparece
             inmediatamente al lado. */
          /* `--libre-izq`: con las cámaras acopladas a la izquierda (globals.css
             § «Cámaras al lado») la barra se corre lo que ellas ocupan. Sin
             acoplar no existe y vale 0. `left` y no `translate`: un translate
             vuelve a la barra el marco de sus tooltips `fixed`. */
          left:
            configMode && !effectiveCompact
              ? "calc(var(--admin-config-panel-w) + var(--libre-izq, 0px))"
              : "var(--libre-izq, 0px)",
        }}
      >
        {/* Arriba, la marca Buleje en una franja fina (Brandon 23-10: «el logo de mi
            empresa Buleje y su nombre»). El logo, el nombre y el tipo de negocio del
            TENANT están en el encabezado, en el botón de identidad
            (`AdminUserDropdown`), y la ventana «Tipo de negocio» se abre desde su
            tarjeta. Compactar y Configurar siguen en el pie (`PieDeBarra`). */}
        <>
        {/* Al lado del logo, ocultar/mostrar el encabezado (Brandon 24-10). Compacta, va debajo. */}
        <div className={cn("flex shrink-0 items-center", effectiveCompact ? "flex-col justify-center gap-1 px-1.5 py-2" : "h-14 justify-between gap-2 pl-4 pr-2")}>
          <button
            type="button"
            onClick={() => navigateTab("inicio" as Tab)}
            aria-label="Buleje: ir a Inicio"
            className="inline-flex min-h-11 items-center rounded-xl px-1 transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {effectiveCompact ? (
              <BulejeMark size={32} forceDark={isDarkTheme} />
            ) : (
              <BulejeWordmark size={32} textSize={19} forceDark={isDarkTheme} className={isDarkTheme ? "text-white" : undefined} />
            )}
          </button>
          <BotonCabecera oscuro={isDarkTheme} />
        </div>
        {/* Sin buscador acá — Brandon 2026-08-03. El encabezado ya tiene el
            suyo (⌘K / el pill "Buscar módulos, productos, clientes…"), que
            además busca productos, clientes y pedidos, no sólo módulos. Un
            segundo campo arriba de "Inicio" empujaba el menú hacia abajo para
            repetir algo que está a la vista dos centímetros más arriba.
            El drawer del celular SÍ conserva el suyo: ahí el buscador del
            encabezado no está montado mientras el menú está abierto. */}

        {/* ── Navigation ── */}
        <nav className={cn(
          "flex-1 overflow-y-auto py-2 transition-all duration-[var(--dur-base)] scrollbar-hide",
          effectiveCompact ? "px-1.5" : "px-2.5"
        )}>
          {/* El bloque "Recientes" salió del nav — Brandon 2026-08-02. Ocupaba
              el tope del acordeón con 4 entradas que se movían solas, así que
              la primera categoría real nunca estaba en el mismo lugar dos
              veces. Favoritos y los atajos personalizados cubren el mismo
              atajo sin cambiar de posición. */}

          {navMode === "enlaces" && (
            <SidebarEnlacesSueltos
              grupos={gruposSueltos}
              compacto={effectiveCompact}
              tab={tab}
              allTabs={allTabs}
              resolveLabel={resolveLabel}
              navigateTab={navigateTab}
              alerts={alerts}
              destacados={verticalFeaturedSet}
              estilo={themeClasses}
              densidad={densidad}
              accentBarStyle={accentBarStyle}
              colorDeIcono={(id) => ICON_COLORS[id] ?? "text-[var(--text-tertiary)]"}
              onHoverCompacto={handleCompactHover}
              onLeaveCompacto={handleCompactLeave}
            />
          )}

          {/* ── Main modules (expanded mode) ── */}
          {navMode === "categorias" && !effectiveCompact && navCategories.map((category, catIdx) => {
            // RBAC + ocultos del usuario + plantilla + tipo de negocio + especialización.
            const { visible: verticalVisible, comingSoon: catComingSoon } = tabsDeCategoria(category);
            const catTabs = verticalVisible;
            // comingSoon items for this category (shown disabled)
            const catComingSoonItems = catComingSoon;

            if (catTabs.length === 0 && catComingSoonItems.length === 0) return null;
            const CategoryIcon = category.icon;
            // Brandon 2026-06-14: TODA categoría con 1 solo enlace visible es un
            // LINK DIRECTO (sin chevron, sin acordeón) — incluido "Agricultura"
            // (antes forzada a grupo por alwaysGroup). Las branded (alwaysGroup)
            // conservan su label/icono de sección aunque sean link directo.
            const isSingleTab = catTabs.length === 1;
            const sectionLabel = SECTION_BEFORE[category.id];
            const iconColor = ICON_COLORS[category.id] ?? "text-[var(--text-tertiary)]";

            // Determine if this category or any of its tabs is active
            const isActive = isSingleTab
              ? tab === catTabs[0]
              : (catTabs as string[]).includes(tab as string);
            const totalAlerts = catTabs.reduce((sum, t) => sum + (alerts[t] || 0), 0);
            const abierta = expandedCategories.has(category.id);

            // Resolve display info — aplica label custom de la plantilla.
            // Branded (alwaysGroup, ej. Agricultura): aunque sea link directo
            // conserva el label/icono de la SECCIÓN, no el del tab interno.
            const useCategoryIdentity = !isSingleTab || category.alwaysGroup;
            const displayLabel = useCategoryIdentity
              ? resolveLabel(category.id, category.label)
              : resolveLabel(catTabs[0], allTabs.find(t => t.id === catTabs[0])?.label ?? category.label);
            const DisplayIcon = useCategoryIdentity
              ? CategoryIcon
              : (allTabs.find(t => t.id === catTabs[0])?.icon ?? CategoryIcon);

            return (
              <React.Fragment key={category.id}>
                {/* Separador entre secciones — sin texto (Brandon 2026-08-28):
                    los encabezados "Operaciones/Clientes/Gestión…" repetían
                    lo que el ícono+color de cada categoría ya comunica y
                    partían el menú en bloques con más aire del que hace
                    falta. Sólo queda el hairline que separaba los grupos —
                    el label sigue siendo single source (`SECTION_BEFORE`)
                    para el drawer mobile, que sí lo muestra. */}
                {sectionLabel && catIdx > 0 && (
                  <div className={cn(densidad.separador, "border-t", themeClasses.border)} />
                )}

                <div className="group/cat relative">
                    <button
                      ref={(el) => { categoryRefs.current[category.id] = el; }}
                      data-tour-tab={isSingleTab ? catTabs[0] : category.id}
                      aria-expanded={isSingleTab ? undefined : abierta}
                      aria-current={isActive ? (isSingleTab ? "page" : "true") : undefined}
                      onMouseEnter={(e) => {
                        if (!isSingleTab) handleCategoryMouseEnter(category.id);
                        // Precarga el chunk del tab (link directo o 1er sub-tab) → clic instantáneo.
                        preloadTab(catTabs[0] as string);
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
                          // Acordeón estricto (Brandon 2026-05-29): abrir una
                          // categoría cierra las demás; re-click la cierra.
                          setExpandedCategories(prev =>
                            prev.has(category.id) ? new Set() : new Set([category.id]),
                          );
                        }
                      }}
                      className={cn(
                        "group relative w-full flex items-center rounded-xl text-[length:var(--ts-sm)] font-medium transition-all duration-[var(--dur-fast)]",
                        densityPad,
                        densityGap,
                        isActive ? themeClasses.activeItem : cn(themeClasses.text, themeClasses.hover),
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
                          ? themeClasses.iconoActivo
                          : iconColor
                      )} />

                      <span className="truncate flex-1 text-left">{displayLabel}</span>
                      {isSingleTab && (
                        <ScopeBadge tabId={catTabs[0] as string} variant="dot" />
                      )}

                      {totalAlerts > 0 && (
                        <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error-700)] text-white leading-none animate-pulse">
                          {totalAlerts}
                        </span>
                      )}

                      {!isSingleTab && (
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex transition-[rotate] duration-[var(--dur-base)] ease-[var(--ease-editorial)] motion-reduce:transition-none",
                            abierta && "rotate-90",
                          )}
                        >
                          <ChevronRight className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-colors",
                            isActive ? themeClasses.iconoActivo : themeClasses.chevron
                          )} />
                        </span>
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
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 opacity-0 pointer-events-none group-hover/cat:opacity-100 transition-opacity duration-[var(--dur-micro)] delay-[60ms] z-50">
                          <div className="relative bg-[var(--surface-raised)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-2 max-w-[220px] leading-relaxed shadow-lg border border-[var(--rule-base)] ">
                            <div className="absolute top-1/2 -translate-y-1/2 right-full w-0 h-0 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-white dark:border-r-[var(--surface-raised)]" />
                            {tipText}
                          </div>
                        </div>
                      );
                    })()}
                    </div>

                    {/* Sub-tabs: la altura va de 0fr a 1fr (sin medir) con la curva
                        editorial del DS, y los hijos entran con opacidad y un leve
                        desplazamiento. Al cerrar se apagan antes de que la altura
                        termine (no se ven cortados). Abrir una y cerrar otra corren
                        juntas con la misma curva: el total no salta. Reduced motion:
                        instantáneo. `inert` cerrado: Tab no entra en lo que no se ve. */}
                    {!isSingleTab && (
                      <div
                        data-acordeon={abierta ? "abierto" : "cerrado"}
                        inert={!abierta}
                        className={cn(
                          "grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-[var(--ease-editorial)] motion-reduce:transition-none",
                          abierta ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className={cn(
                            "ml-4 pl-3 border-l-2 py-1 transition-[opacity,translate] ease-[var(--ease-editorial)] motion-reduce:transition-none",
                            abierta
                              ? "opacity-100 translate-y-0 duration-[var(--dur-base)] delay-[40ms]"
                              : "opacity-0 -translate-y-1.5 duration-[var(--dur-fast)]",
                            densidad.subEspacio,
                            themeClasses.border,
                          )}>
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
                                  onMouseEnter={() => preloadTab(subTabId)}
                                  onFocus={() => preloadTab(subTabId)}
                                  className={cn(
                                    "group relative w-full flex items-center gap-2.5 px-3 rounded-xl text-[length:var(--ts-sm)] transition-all",
                                    densidad.sub,
                                    isSubActive ? themeClasses.activeItem : cn(themeClasses.text, themeClasses.hover, "font-medium")
                                  )}
                                >
                                  {isSubActive && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full" style={accentBarStyle} />
                                  )}
                                  <SubIcon className={cn(
                                    "h-4 w-4 shrink-0 transition-transform duration-[var(--dur-base)] group-hover:scale-110",
                                    isSubActive ? themeClasses.iconoActivo : themeClasses.iconoSub
                                  )} />
                                  <span className="truncate">{subTabLabel}</span>
                                  <ScopeBadge tabId={subTabId} variant="dot" />
                                  {isFeaturedSub && subAlertCount === 0 && subTabId !== "asistente-ia" && (
                                    <span className="ml-auto shrink-0 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-md bg-[var(--data-warning-500)]/20 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] leading-none">
                                      Destacado
                                    </span>
                                  )}
                                  {subTabId === "asistente-ia" && subAlertCount === 0 && (
                                    <span className="ml-auto shrink-0 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground leading-none">
                                      Nuevo
                                    </span>
                                  )}
                                  {subAlertCount > 0 && (
                                    <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error-700)] text-white leading-none ml-auto animate-pulse">
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
                                  title="Módulo disponible pronto"
                                >
                                  {ComingIcon && <ComingIcon className="h-4 w-4 shrink-0" />}
                                  <span className="truncate">{label}</span>
                                  <PillPronto className="ml-auto" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
              </React.Fragment>
            );
          })}

          {/* Modo compacto: un icono POR CATEGORÍA, no por tab.
              Antes acá se listaban los tabs sueltos (`filteredTabs`), así que
              el menú colapsado ofrecía otra cosa que el desplegado: sin
              secciones, sin grupos y sin forma de ver qué había dentro de una
              categoría. Ahora recorre las MISMAS `navCategories`: si la
              categoría tiene un solo tab visible navega directo, y si tiene
              varios, el hover abre el flyout con la lista completa — las
              mismas opciones que al desplegar. */}
          {navMode === "categorias" && effectiveCompact && navCategories.map((category) => {
            const { visible: catTabs } = tabsDeCategoria(category);
            if (catTabs.length === 0) return null;
            const single = catTabs.length === 1;
            const first = catTabs[0];
            const info = allTabs.find(t => t.id === first);
            const useCatIdentity = !single || category.alwaysGroup;
            const id = first as Tab;
            const label = useCatIdentity
              ? resolveLabel(category.id, category.label)
              : resolveLabel(first, info?.label ?? category.label);
            const Icon = (useCatIdentity ? category.icon : (info?.icon ?? category.icon)) as React.ElementType;
            const alertCount = catTabs.reduce((sum, t) => sum + (alerts[t] || 0), 0);
            const isActive = (catTabs as string[]).includes(tab as string);
            return (
              <div key={category.id} className="relative">
                <button
                  data-tour-tab={id}
                  aria-current={isActive ? (single ? "page" : "true") : undefined}
                  onClick={(e) => {
                    if (single) { navigateTab(id); return; }
                    const r = e.currentTarget.getBoundingClientRect();
                    onSidebarFlyoutChange({ categoryId: category.id, top: r.top });
                  }}
                  onMouseEnter={(e) => {
                    preloadTab(id);
                    handleCompactHover(e.currentTarget, label);
                    if (!single) {
                      if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current);
                      const r = e.currentTarget.getBoundingClientRect();
                      onSidebarFlyoutChange({ categoryId: category.id, top: r.top });
                    }
                  }}
                  onMouseLeave={() => {
                    handleCompactLeave();
                    if (!single) {
                      flyoutTimerRef.current = setTimeout(() => onSidebarFlyoutChange(null), 150);
                    }
                  }}
                  aria-label={label}
                  aria-haspopup={single ? undefined : "menu"}
                  className={cn(
                    "relative w-full flex items-center justify-center rounded-xl transition-all mb-0.5 px-0 py-2.5",
                    isActive ? cn(themeClasses.activeItem) : cn(themeClasses.text, themeClasses.hover),
                  )}
                >
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" style={accentBarStyle} />}
                  <Icon className="h-5 w-5 shrink-0 transition-transform duration-[var(--dur-base)]" />
                  {!single && (
                    <span className="absolute bottom-1 right-1.5 h-1 w-1 rounded-full bg-current opacity-50" aria-hidden />
                  )}
                  {alertCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--data-error-700)] text-white text-xs font-extrabold tabular-nums leading-none ring-2 ring-[var(--surface-raised)] dark:ring-[var(--surface-canvas)] shadow-sm"
                      title={`${alertCount} ${alertCount === 1 ? "alerta" : "alertas"} sin leer`}
                    >
                      {alertCount > 9 ? "9+" : alertCount}
                    </span>
                  )}
                </button>
              </div>
            );
          })}

        </nav>

        {/* ── Pie: Compactar + Configurar, a la vista sólo con el mouse o el
            foco de teclado en la barra (PieDeBarra.tsx). "Ver tiendas ↗" salió
            del pie — Brandon 2026-08-02. ── */}
        <PieDeBarra
          estilo={themeClasses}
          compacto={effectiveCompact}
          focusMode={focusMode}
          isCompact={isCompact}
          onCompactar={toggleCompact}
          onConfigurar={openConfig}
          enlaceTienda={SHOW_MI_TIENDA_LINK && isRealTenant ? (
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
          ) : undefined}
        />
        <TiradorAncho oculto={effectiveCompact} />
        </>
      </aside>

      {/* ── Configurator panel — al inicio (left: 0), sidebar real al lado.
          Orden natural: usuario edita aquí ← y ve el resultado aquí →. */}
      {configMode && !effectiveCompact && !presentationMode && (
        <aside
          className={cn(
            "hidden md:flex fixed top-0 bottom-0 z-50 flex-col overflow-hidden border-r shadow-[var(--shadow-xl)]",
            themeClasses.border,
          )}
          style={{ left: 0, width: "var(--admin-config-panel-w)" }}
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
            navMode={navMode}
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
          <div className="relative bg-[var(--surface-raised)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-2 shadow-lg border border-[var(--rule-base)] min-w-[140px] max-w-[240px]">
            <div className="absolute top-1/2 -translate-y-1/2 right-full w-0 h-0 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-white dark:border-r-[var(--surface-raised)]" />
            <div className="font-semibold whitespace-nowrap">{compactTooltip.label}</div>
            {compactTooltip.tip && (
              <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">{compactTooltip.tip}</div>
            )}
          </div>
        </div>
      )}

      {/* Sidebar category flyout panel — only for multi-tab categories */}
      {/* Flyout del modo compacto: la lista de tabs de la categoría bajo el
          cursor. Estaba escrito pero MUERTO — nadie llamaba a
          onSidebarFlyoutChange con un valor, y encima la condición pedía
          `!effectiveCompact`, o sea que sólo habría aparecido con el sidebar
          desplegado, donde el acordeón ya muestra lo mismo. */}
      {effectiveCompact && sidebarFlyout && (() => {
        const cat = visibleCategories.find(c => c.id === sidebarFlyout.categoryId);
        if (!cat) return null;
        const { visible: catTabs, comingSoon: catProximos } = tabsDeCategoria(cat);
        if (catTabs.length <= 1) return null;
        return (
          <m.div
            key={sidebarFlyout.categoryId}
            initial={{ opacity: 0, x: -8, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.15 }}
            // El sidebar compacto mide 60px (l.859); el 264 hardcodeado era el
            // ancho del EXPANDIDO, así que el panel habría aparecido flotando a
            // 200px del icono.
            style={{ ...estiloAcento, position: "fixed", top: sidebarFlyout.top, left: 68, zIndex: 50 }}
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
                      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] font-semibold"
                      : "text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] font-medium"
                  )}
                >
                  <FlyoutTabIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{resolveLabel(tabId, tabInfo.label)}</span>
                  <ScopeBadge tabId={tabId} variant="dot" />
                </button>
              );
            })}
            {catProximos.map((tabId) => {
              const tabInfo = allTabs.find(t => t.id === tabId);
              if (!tabInfo) return null;
              const ProximoIcon = tabInfo.icon;
              return (
                <div
                  key={`pronto-${tabId}`}
                  title="Módulo disponible pronto"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] opacity-50 cursor-not-allowed select-none"
                >
                  <ProximoIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{resolveLabel(tabId, tabInfo.label)}</span>
                  <PillPronto />
                </div>
              );
            })}
          </m.div>
        );
      })()}

      {/* Sidebar flyout panel — expanded mode hover (Holded-style) */}
      {!effectiveCompact && hoveredCategory && flyoutPosition && !expandedCategories.has(hoveredCategory) && (() => {
        const cat = visibleCategories.find(c => c.id === hoveredCategory);
        if (!cat) return null;
        const { visible: catTabs, comingSoon: catProximos } = tabsDeCategoria(cat);
        if (catTabs.length <= 1) return null;
        const aFila = (ids: string[]) =>
          ids
            .map(tId => allTabs.find(t => t.id === tId))
            .filter((t): t is typeof allTabs[number] => t != null)
            .map(t => ({ id: t.id as string, label: resolveLabel(t.id, t.label), icon: t.icon as React.ComponentType<{ className?: string }> }));
        const flyoutTabs = aFila(catTabs);
        return (
          <div className="contents" style={estiloAcento}>
          <SidebarFlyout
            key={hoveredCategory}
            category={{ id: cat.id, label: cat.label, tabs: catTabs as string[] }}
            tabs={flyoutTabs}
            proximos={aFila(catProximos)}
            activeTab={tab}
            onNavigate={(tabId) => navigateTab(tabId as Tab)}
            position={flyoutPosition}
            onClose={() => setHoveredCategory(null)}
            onMouseEnter={handleFlyoutMouseEnter}
            onMouseLeave={handleFlyoutMouseLeave}
            theme={themeClasses.flyout}
          />
          </div>
        );
      })()}

    </>
  );
});
