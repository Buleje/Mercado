"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import CommandPalette from "./CommandPalette";
import { NotificationsBell } from "./_shared/NotificationsBell";
import SuperAdminChatPopover from "./chat/SuperAdminChatPopover";
import SidebarConfigPanel from "./SidebarConfigPanel";
import {
  LayoutDashboard,
  Building2,
  ShoppingBag,
  BarChart3,
  Activity,
  Settings,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Clock,
  Gauge,
  HeartPulse,
  FileCheck,
  ImageIcon,
  Sparkles,
  Layers,
  Sliders,
  BookOpen,
  Palette,
  Wallet,
  Server,
  Home,
  MessageSquare,
  Store,
  Truck,
  TrendingUp,
  ChefHat,
  ClipboardCheck,
  Boxes,
  AlertOctagon,
  FileText,
  Search,
  Inbox,
  Bell,
  Webhook,
  Globe,
  ShieldAlert,
  HeartHandshake,
  Scale,
  History,
  Megaphone,
} from "@buleje/design-system/icons";
import { BulejeMark } from "@/components/ui-system/illustrations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
}

type NavGroupId = "inicio" | "tiendas" | "marketplace" | "finanzas" | "diseno" | "operaciones" | "sistema";

interface NavGroupDef {
  id: NavGroupId;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

interface SuperAdminShellProps {
  children: React.ReactNode;
  username: string;
  freshToken?: string | null;
}

// ─── Nav groups (5 categorías colapsables) ────────────────────────────────────
//
// Por qué agrupado: con 19 enlaces planos el ojo barre toda la lista cada vez.
// Las categorías reflejan el "modo mental" del superadmin:
//  • Plataforma — métricas globales (¿cómo está todo?)
//  • Negocios — gestión de tenants (¿quiénes están?)
//  • Catálogo & Marca — assets visuales que se publican (¿cómo se ven?)
//  • Pagos & Riesgo — flujos de dinero y seguridad (¿qué hay que aprobar?)
//  • Sistema — meta-config (¿cómo lo administro?)

// ─── 7 grupos balanceados — refresh 2026-05-19 ────────────────────────────────
//
// Razón: 5 grupos previos eran ambiguos ("Aplicaciones" sin contexto,
// "Catálogo & Marca" mezclaba 6 cosas distintas) y dejaban 9 rutas FUERA
// del nav (billing, dlq, slo, setup, sitemap, roadmap, recetario,
// vendor-health, stores). Brandon: "no se entiende bien".
//
// Nueva estructura:
//   Inicio (3)        — vista rápida
//   Tiendas (3)       — gestión de tenants
//   Marketplace (4)   — público multi-vendor
//   Finanzas (3)      — dinero
//   Diseño (7)        — catálogo + marca + assets
//   Operaciones (5)   — analytics + SRE + queues
//   Sistema (5)       — seguridad + config + meta
//
// Total: 30 rutas — todas accesibles, distribuidas en grupos coherentes.
const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "inicio",
    label: "Inicio",
    icon: <Home className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Dashboard",          icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, href: "/superadmin/dashboard"      },
      { label: "Chat",               icon: <MessageSquare   className="w-5 h-5 shrink-0" />, href: "/superadmin/chat"           },
      { label: "Comunicados",        icon: <Megaphone       className="w-5 h-5 shrink-0" />, href: "/superadmin/comunicados"    },
      { label: "Soporte",            icon: <Inbox           className="w-5 h-5 shrink-0" />, href: "/superadmin/support"        },
      { label: "Alertas",            icon: <Bell            className="w-5 h-5 shrink-0" />, href: "/superadmin/alerts"         },
      { label: "Rescate",            icon: <HeartHandshake  className="w-5 h-5 shrink-0" />, href: "/superadmin/rescue"         },
      { label: "Centro de control",  icon: <Gauge           className="w-5 h-5 shrink-0" />, href: "/superadmin/control-center" },
      { label: "Actividad",          icon: <Activity        className="w-5 h-5 shrink-0" />, href: "/superadmin/activity"       },
    ],
  },
  {
    id: "tiendas",
    label: "Tiendas",
    icon: <Building2 className="w-4 h-4 shrink-0" />,
    // Consolidado 2026-06-17 (Tenants 360): Tenants + Crecimiento + Uso +
    // Activación + Integraciones + Mapa + Especializaciones = 1 módulo con
    // tabs (SuperAdminModuleTabs). Pedidos y Repartidores quedan separados.
    items: [
      { label: "Tenants",      icon: <Building2   className="w-5 h-5 shrink-0" />, href: "/superadmin/tenants"      },
      { label: "Pedidos",      icon: <ShoppingBag className="w-5 h-5 shrink-0" />, href: "/superadmin/orders"       },
      { label: "Repartidores", icon: <Truck       className="w-5 h-5 shrink-0" />, href: "/superadmin/repartidores" },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    icon: <Store className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Marketplace",            icon: <Store     className="w-5 h-5 shrink-0" />, href: "/superadmin/marketplace"         },
      { label: "Solicitudes vendedores", icon: <FileCheck className="w-5 h-5 shrink-0" />, href: "/superadmin/vendor-applications" },
      { label: "Salud de vendors",       icon: <HeartPulse className="w-5 h-5 shrink-0" />, href: "/superadmin/vendor-health"      },
      { label: "Tiendas publicadas",     icon: <Boxes     className="w-5 h-5 shrink-0" />, href: "/superadmin/stores"              },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    icon: <Wallet className="w-4 h-4 shrink-0" />,
    // Consolidado 2026-06-17: 1 módulo con tabs internos (Billing · Pagos
    // pendientes · Pagos Yape). La barra SuperAdminModuleTabs unifica las 3.
    items: [
      { label: "Finanzas", icon: <Wallet className="w-5 h-5 shrink-0" />, href: "/superadmin/billing" },
    ],
  },
  {
    id: "diseno",
    label: "Diseño",
    icon: <Palette className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Centro de diseño",      icon: <Palette   className="w-5 h-5 shrink-0" />, href: "/superadmin/design-system"   },
      { label: "Plantilla del admin",   icon: <Layers    className="w-5 h-5 shrink-0" />, href: "/superadmin/plantilla"       },
      { label: "Marca",                 icon: <Sparkles  className="w-5 h-5 shrink-0" />, href: "/superadmin/marca"           },
      { label: "Banners",               icon: <ImageIcon className="w-5 h-5 shrink-0" />, href: "/superadmin/banners"         },
      { label: "Banco de imágenes",     icon: <ImageIcon className="w-5 h-5 shrink-0" />, href: "/superadmin/banco-imagenes"  },
      { label: "Catálogo de variantes", icon: <BookOpen  className="w-5 h-5 shrink-0" />, href: "/superadmin/variant-catalog" },
      { label: "Recetario",             icon: <ChefHat   className="w-5 h-5 shrink-0" />, href: "/superadmin/recetario"       },
    ],
  },
  {
    id: "operaciones",
    label: "Operaciones",
    icon: <BarChart3 className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Automatizaciones", icon: <Webhook       className="w-5 h-5 shrink-0" />, href: "/superadmin/automations" },
      { label: "Inteligencia de Barrio", icon: <Activity className="w-5 h-5 shrink-0" />, href: "/superadmin/intelligence" },
      { label: "Analytics",     icon: <BarChart3       className="w-5 h-5 shrink-0" />, href: "/superadmin/analytics" },
      { label: "Adopción funciones", icon: <TrendingUp className="w-5 h-5 shrink-0" />, href: "/superadmin/feature-adoption" },
      { label: "Cohortes & retención", icon: <Layers   className="w-5 h-5 shrink-0" />, href: "/superadmin/cohorts" },
      { label: "Salud sistema", icon: <HeartPulse      className="w-5 h-5 shrink-0" />, href: "/superadmin/health"    },
      { label: "SLO & budgets", icon: <TrendingUp      className="w-5 h-5 shrink-0" />, href: "/superadmin/slo"       },
      { label: "Dead-letter",   icon: <AlertOctagon    className="w-5 h-5 shrink-0" />, href: "/superadmin/dlq"       },
      { label: "Errores negocios", icon: <ShieldAlert          className="w-5 h-5 shrink-0" />, href: "/superadmin/tenant-errors" },
      // Brandon 2026-05-21 audit fix #4: "Setup score" eliminado del nav.
      // El page hace redirect("/superadmin/dashboard") (módulo eliminado por
      // decisión de producto), así que enlazarlo confunde al user.
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    icon: <Server className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Seguridad", icon: <ShieldCheck className="w-5 h-5 shrink-0" />, href: "/superadmin/security" },
      { label: "Ley 29733", icon: <Scale      className="w-5 h-5 shrink-0" />, href: "/superadmin/compliance" },
      { label: "Auditoría",  icon: <History    className="w-5 h-5 shrink-0" />, href: "/superadmin/audit-log" },
      // Consolidado 2026-06-17: Settings + Configuración = 1 módulo con tabs
      // (Plataforma · Integraciones & Flags) vía SuperAdminModuleTabs.
      { label: "Ajustes", icon: <Settings className="w-5 h-5 shrink-0" />, href: "/superadmin/settings" },
      // Brandon 2026-05-21 audit fix #4: "Sitemap" y "Roadmap" eliminados del nav.
      // Ambos hacen redirect("/superadmin/dashboard") (módulos eliminados).
    ],
  },
];

// Lista plana derivada — preserva compatibilidad con loadNavConfig (hidden/order
// se aplican dentro de cada grupo, no se rompen las prefs de Brandon).
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Color distinto por categoría principal (Brandon 2026-06-19, ref. sidebar del
// admin de negocio). Paleta del proyecto: teal de marca + acentos legibles sobre
// el slate near-black. Sin naranja/ámbar (constraint de marca).
const GROUP_ICON_COLOR: Record<NavGroupId, string> = {
  inicio:      "text-[#5eead4]", // teal de marca
  tiendas:     "text-[#60a5fa]", // azul
  marketplace: "text-[#a78bfa]", // violeta
  finanzas:    "text-[#34d399]", // verde (dinero)
  diseno:      "text-[#fb7185]", // coral/rosa (creatividad)
  operaciones: "text-[#22d3ee]", // cian
  sistema:     "text-[#94a3b8]", // slate neutro
};

// Title + section (breadcrumb sutil del topbar ejecutivo). El section se
// muestra como prefijo gris, el title como heading H1 del topbar.
type PageMeta = { title: string; section: string };
const PAGE_META: Record<string, PageMeta> = {
  "/superadmin":                  { title: "Dashboard",          section: "Inicio" },
  "/superadmin/dashboard":        { title: "Dashboard",          section: "Inicio" },
  "/superadmin/chat":             { title: "Chat",               section: "Inicio" },
  "/superadmin/control-center":   { title: "Centro de control",  section: "Inicio" },
  "/superadmin/activity":         { title: "Actividad",          section: "Inicio" },

  "/superadmin/tenants":          { title: "Tenants",            section: "Tiendas" },
  "/superadmin/orders":           { title: "Pedidos",            section: "Tiendas" },
  "/superadmin/repartidores":     { title: "Repartidores",       section: "Tiendas" },

  "/superadmin/marketplace":              { title: "Marketplace",            section: "Marketplace" },
  "/superadmin/marketplace/suppliers":    { title: "Proveedores",            section: "Marketplace" },
  "/superadmin/marketplace/category-images": { title: "Imágenes de categorías", section: "Marketplace" },
  "/superadmin/vendor-applications":       { title: "Solicitudes",            section: "Marketplace" },
  "/superadmin/vendor-health":            { title: "Salud de vendors",       section: "Marketplace" },
  "/superadmin/stores":                   { title: "Tiendas publicadas",     section: "Marketplace" },

  "/superadmin/pagos-pendientes": { title: "Pagos pendientes",   section: "Finanzas" },
  "/superadmin/pagos-yape":       { title: "Pagos Yape (IA)",    section: "Finanzas" },
  "/superadmin/billing":          { title: "Billing & Stripe",   section: "Finanzas" },

  "/superadmin/design-system":    { title: "Centro de diseño",       section: "Diseño" },
  "/superadmin/plantilla":        { title: "Plantilla del admin",    section: "Diseño" },
  "/superadmin/marca":            { title: "Marca de la plataforma", section: "Diseño" },
  "/superadmin/banners":          { title: "Banners",                section: "Diseño" },
  "/superadmin/banco-imagenes":   { title: "Banco de imágenes",      section: "Diseño" },
  "/superadmin/variant-catalog":  { title: "Catálogo de variantes",  section: "Diseño" },
  "/superadmin/recetario":        { title: "Recetario",              section: "Diseño" },

  "/superadmin/intelligence": { title: "Inteligencia de Barrio", section: "Operaciones" },
  "/superadmin/analytics":  { title: "Analytics",     section: "Operaciones" },
  "/superadmin/health":     { title: "Salud sistema", section: "Operaciones" },
  "/superadmin/slo":        { title: "SLO & budgets", section: "Operaciones" },
  "/superadmin/dlq":        { title: "Dead-letter queue", section: "Operaciones" },
  "/superadmin/setup":      { title: "Setup score",   section: "Operaciones" },

  "/superadmin/security":      { title: "Seguridad",     section: "Sistema" },
  "/superadmin/configuracion": { title: "Configuración", section: "Sistema" },
  "/superadmin/settings":      { title: "Settings",      section: "Sistema" },
  "/superadmin/sitemap":       { title: "Sitemap",       section: "Sistema" },
  "/superadmin/roadmap":       { title: "Roadmap",       section: "Sistema" },
};

const STORAGE_KEY_HIDDEN = "superadmin-nav-hidden";
const STORAGE_KEY_ORDER = "superadmin-nav-order";
const STORAGE_KEY_THEME = "superadmin-nav-theme";
const STORAGE_KEY_ACCENT = "superadmin-nav-accent";
const STORAGE_KEY_DENSITY = "superadmin-nav-density";
const STORAGE_KEY_ICON_STYLE = "superadmin-nav-icon-style";

type SidebarVisualPrefs = {
  theme: "light" | "dark" | "cristal" | "shaded" | "buleje";
  accent: "teal" | "emerald" | "sky" | "violet" | "amber" | "rose";
  density: "compact" | "normal" | "spacious";
  iconStyle: "colored" | "monochrome";
};

const ACCENT_HEX: Record<SidebarVisualPrefs["accent"], string> = {
  teal: "#00A0A0",
  emerald: "#10B981",
  sky: "#0EA5E9",
  violet: "#8B5CF6",
  amber: "#00A0A0", // Brandon 2026-06-17: "sin naranja" — amber legacy renderiza teal de marca
  rose: "#F43F5E",
};

// Default = look del admin de negocio (referencia de Brandon 2026-06-16):
// oscuro slate "buleje" + acento teal de marca, densidad normal, iconos a color.
// (NO el preset Ejecutivo/ambar — la referencia es teal, no ambar.)
const DEFAULT_VISUAL: SidebarVisualPrefs = {
  theme: "buleje",
  accent: "teal",
  density: "normal",
  iconStyle: "colored",
};

function loadNavConfig(): { hidden: Set<string>; order: string[]; visual: SidebarVisualPrefs } {
  if (typeof window === "undefined")
    return { hidden: new Set(), order: [], visual: DEFAULT_VISUAL };
  try {
    const hiddenRaw = localStorage.getItem(STORAGE_KEY_HIDDEN);
    const orderRaw = localStorage.getItem(STORAGE_KEY_ORDER);
    const hidden = new Set<string>(hiddenRaw ? JSON.parse(hiddenRaw) : []);
    const order: string[] = orderRaw ? JSON.parse(orderRaw) : [];
    const visual: SidebarVisualPrefs = {
      theme: (localStorage.getItem(STORAGE_KEY_THEME) as SidebarVisualPrefs["theme"]) ?? DEFAULT_VISUAL.theme,
      accent: (localStorage.getItem(STORAGE_KEY_ACCENT) as SidebarVisualPrefs["accent"]) ?? DEFAULT_VISUAL.accent,
      density: (localStorage.getItem(STORAGE_KEY_DENSITY) as SidebarVisualPrefs["density"]) ?? DEFAULT_VISUAL.density,
      iconStyle: (localStorage.getItem(STORAGE_KEY_ICON_STYLE) as SidebarVisualPrefs["iconStyle"]) ?? DEFAULT_VISUAL.iconStyle,
    };
    return { hidden, order, visual };
  } catch {
    return { hidden: new Set(), order: [], visual: DEFAULT_VISUAL };
  }
}

/** Filtra y reordena los items según las prefs guardadas en localStorage. */
function applyNavConfig(items: NavItem[], hidden: Set<string>, order: string[]): NavItem[] {
  const visible = items.filter((it) => !hidden.has(it.href));
  if (order.length === 0) return visible;
  const byHref = new Map(visible.map((it) => [it.href, it] as const));
  const ordered: NavItem[] = [];
  for (const href of order) {
    const it = byHref.get(href);
    if (it) {
      ordered.push(it);
      byHref.delete(href);
    }
  }
  // Cualquier item nuevo no presente en el orden guardado va al final.
  for (const it of byHref.values()) ordered.push(it);
  return ordered;
}

// ─── Theme hook ───────────────────────────────────────────────────────────────

function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    const stored = localStorage.getItem("superadmin-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored ? stored === "dark" : prefersDark;
    if (isDark !== dark) {
      setDark(isDark);
      document.documentElement.classList.toggle("dark", isDark);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("superadmin-theme", next ? "dark" : "light");
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  return { dark, toggle };
}

// ─── Impersonation Banner ─────────────────────────────────────────────────────

function ImpersonationBanner({ slug, onClear }: { slug: string; onClear: () => void }) {
  return (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-50 bg-[var(--data-warning-500)] text-[var(--text-inverse)] text-xs font-semibold flex items-center justify-center gap-3 py-2 px-4"
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      Estás viendo como:{" "}
      <span className="font-mono bg-black/20 px-1.5 py-0.5 rounded">{slug}</span>
      <button type="button" onClick={onClear} className="ml-2 underline hover:no-underline">
        Salir
      </button>
    </div>
  );
}

// ─── Main Shell ───────────────────────────────────────────────────────────────

export default function SuperAdminShell({ children, username, freshToken }: SuperAdminShellProps) {
  const pathname = usePathname();
  const { dark, toggle } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [navItems, setNavItems] = useState<NavItem[]>(NAV_ITEMS);
  const [visual, setVisual] = useState<SidebarVisualPrefs>(DEFAULT_VISUAL);
  // 2026-05-28 — Buscador de módulos del nav. Filtra grupos+items por
  // label/href cuando el query >= 2 chars. Si no hay match, muestra empty
  // state. Sin query → grupos normales.
  const [navSearch, setNavSearch] = useState("");
  // Slide-over "Configurar barra lateral" (1:1 con el footer del admin de negocio).
  const [configOpen, setConfigOpen] = useState(false);
  // Badge de alertas críticas activas en el nav (#2). Refresca cada 2 min.
  const [alertCount, setAlertCount] = useState(0);

  // 2026-05-28 — Filtra los NAV_GROUPS por query (label/href). Si query
  // está vacío o tiene menos de 2 chars, retorna grupos completos. Si hay
  // match, retorna grupos con SOLO los items que matchean (mantiene
  // estructura para que el flyout/accordion renderee igual).
  const filteredGroups = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    if (q.length < 2) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.href.toLowerCase().includes(q) ||
          g.label.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [navSearch]);

  const hasSearchResults = filteredGroups.length > 0;
  const isSearching = navSearch.trim().length >= 2;

  // Sincroniza nav items + visual prefs con la config guardada. Reacciona
  // a "storage" (otra pestaña) y a custom event "superadmin-nav-config-changed"
  // que dispara la página de settings.
  useEffect(() => {
    const refresh = () => {
      const { hidden, order, visual } = loadNavConfig();
      setNavItems(applyNavConfig(NAV_ITEMS, hidden, order));
      setVisual(visual);
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("superadmin-nav-config-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("superadmin-nav-config-changed", refresh);
    };
  }, []);

  // Aplica visual prefs vía CSS variable --accent (afecta highlights, focus
  // rings, hover backgrounds, etc.) en :root para todo el shell.
  useEffect(() => {
    const root = document.documentElement;
    const hex = ACCENT_HEX[visual.accent] ?? ACCENT_HEX.teal;
    root.style.setProperty("--accent", hex);
    root.style.setProperty("--accent-soft", `${hex}26`);
    root.style.setProperty("--accent-600", hex);
  }, [visual.accent]);

  // Densidad: padding/altura de los items del sidebar.
  const navItemPadding =
    visual.density === "compact" ? "px-2.5 py-1.5" : visual.density === "spacious" ? "px-3 py-3" : "px-3 py-2";

  // Theme "buleje" — identidad de marca real, sidebar branded slate-deep + teal vibrante.
  // IMPORTANTE: cristal/shaded ahora COMPARTEN el render con buleje — los users que
  // tenían cristal o shaded guardado en localStorage ven el nuevo look automáticamente,
  // sin necesidad de re-aplicar preset. Era lo que cristal "intentaba ser" según comentarios
  // legacy del código ("paleta de marca Buleje") pero el render anterior era washed-out.
  // Brandon 2026-06-19: el tema "dark" (Ejecutivo) ahora COMPARTE el look
  // near-black + texto blanco del tema buleje. Antes "dark" usaba zinc-900 +
  // texto gris (--text-secondary) → era lo que dejaba el sidebar gris pese a
  // los cambios de blanco. Solo el tema claro queda con la rama no-oscura.
  const isBuleje =
    visual.theme === "buleje" || visual.theme === "cristal" ||
    visual.theme === "shaded" || visual.theme === "dark";

  const sidebarBgClass = isBuleje
    ? // Slate near-black + border teal hairline + text-white.
      "bg-[linear-gradient(180deg,#060d13_0%,#030a0f_50%,#02080c_100%)] border-r border-[rgba(0,160,160,0.18)] text-white shadow-[inset_-1px_0_0_rgba(0,160,160,0.06)]"
    : "bg-[var(--surface-canvas)] border-r border-[var(--rule-base)]";

  // Override de clases para items cuando es theme buleje — paleta cohesiva, contraste AAA.
  const navItemActiveClass = isBuleje
    ? "bg-[rgba(0,160,160,0.18)] text-[#5eead4] font-semibold shadow-[inset_2px_0_0_#14C2C2]"
    : "bg-[var(--accent-soft)] text-[var(--accent)]";
  const navItemIdleClass = isBuleje
    ? "text-white/75 hover:bg-white/[0.06] hover:text-white"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";
  // Brandon mayo 2026 v3: logo con mejor contraste — gradient ámbar fuerte
  // sobre dark, ring sutil que separa del fondo, sombra cálida. Labels en
  // blanco con drop-shadow para legibilidad sobre cualquier theme.
  // Logo = círculo BLANCO con la marca Buleje en teal (referencia Brandon
  // 2026-06-16: "redondo con fondo blanco", igual que el admin). Sin ámbar.
  const logoBoxClass = "bg-white text-[#00A0A0] shadow-md ring-1 ring-black/[0.06]";
  const logoLabelClass = isBuleje
    ? "text-white"
    : "text-white dark:text-white drop-shadow-sm";
  const logoSubLabelClass = isBuleje
    ? "text-[#5eead4]"
    : "text-teal-300 dark:text-teal-300";
  const logoBorderClass = isBuleje ? "border-white/[0.08]" : "border-white/[0.10]";
  const collapseBtnClass = isBuleje
    ? "text-white/85 hover:bg-white/[0.08] hover:text-white"
    : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]";

  const iconClassName =
    visual.iconStyle === "monochrome" ? "opacity-70 grayscale" : "";

  // ── Header ejecutivo ──────────────────────────────────────────────────────
  // El header oscurece junto con el sidebar cuando el tema es integral-oscuro
  // (buleje/cristal/shaded → slate; "dark" → zinc ejecutivo), igual que el
  // AdminTopHeader del panel de negocio (isAutoDarkTheme). Antes el header del
  // superadmin quedaba claro aunque el sidebar fuera oscuro (inconsistente).
  // Los elementos internos reusan los patrones dark del propio sidebar.
  // isBuleje ya incluye "dark", así que el header oscurece con el sidebar en
  // todos los temas integral-oscuro. Solo el tema claro usa la rama clara.
  const headerDark = isBuleje;
  const headerClass = headerDark
    ? "bg-[linear-gradient(180deg,#060d13_0%,#02080c_100%)] border-[color-mix(in_oklab,var(--accent)_30%,transparent)] text-white/90"
    : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-primary)]";
  const headerSectionClass = headerDark ? "text-white/45" : "text-[var(--text-tertiary)]";
  const headerTitleClass = headerDark ? "text-white" : "text-[var(--text-primary)]";
  const headerPillClass = headerDark
    ? "border-white/15 bg-white/[0.06] hover:border-[color-mix(in_oklab,var(--accent)_45%,transparent)] hover:bg-white/[0.1]"
    : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-[color-mix(in_oklab,var(--accent)_40%,transparent)] hover:bg-[var(--surface-raised)]";
  const headerPillTextClass = headerDark
    ? "text-white/55 group-hover:text-white/80"
    : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]";
  const headerKbdClass = headerDark
    ? "border-white/15 text-white/55 bg-white/[0.06]"
    : "border-[var(--rule-base)] text-[var(--text-tertiary)] bg-[var(--surface-raised)]";
  const headerIconBtnClass = headerDark
    ? "text-white/55 hover:text-white hover:bg-white/[0.1]"
    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";
  const headerChipClass = headerDark
    ? "bg-white/[0.06] border-white/10 text-white/80"
    : "bg-[var(--surface-sunken)] border-[var(--rule-soft)] text-[var(--text-secondary)]";
  const headerDividerClass = headerDark ? "bg-white/10" : "bg-[var(--rule-soft)]";

  // Rotate session cookie if the layout detected it's past halfway
  useEffect(() => {
    if (freshToken) {
      import("@/app/superadmin/actions").then(({ rotatePlatformCookie }) =>
        rotatePlatformCookie(freshToken).catch(() => {})
      );
    }
  }, [freshToken]);

  // Check for impersonation on mount
  useEffect(() => {
    const slug = localStorage.getItem("impersonating-tenant");
    if (slug) setImpersonating(slug);
  }, []);

  // Badge de alertas críticas activas (#2): cuenta del Centro de alertas, refresca
  // al montar + cada 2 min (salvo pestaña en background). Reusa el endpoint que ya
  // filtra resueltas/pospuestas. Best-effort: si falla, el badge queda en 0.
  useEffect(() => {
    let active = true;
    const fetchCount = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/superadmin/alerts");
        if (!res.ok || !active) return;
        const d = (await res.json()) as { counts?: { critical?: number } };
        if (active) setAlertCount(d.counts?.critical ?? 0);
      } catch (err) {
        // Best-effort: el badge es accesorio; si falla, queda en 0 sin romper nada.
        console.warn("[superadmin] alert count failed", String(err));
      }
    };
    void fetchCount();
    const timer = setInterval(fetchCount, 2 * 60 * 1000);
    const onAlerts = () => void fetchCount();
    window.addEventListener("superadmin-alerts-changed", onAlerts);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("superadmin-alerts-changed", onAlerts);
    };
  }, []);

  // Verificar sesión periódicamente (cada 2 min) — si expiró, mostrar aviso
  useEffect(() => {
    let active = true;
    const check = async () => {
      // Audit QW-1: si el tab está en background, no gastamos request.
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/superadmin/auth", { method: "GET" });
        if (!res.ok && active) {
          // QA Brandon 2026-06-10: tras detectar la expiración, DETENER el
          // poll — antes seguía cada 2 min golpeando con 401 (ruido). El
          // banner de "sesión expirada" ya queda visible para ir al login.
          setSessionExpired(true);
          clearInterval(timer);
        }
      } catch {
        // Network error — no marcar como expirado
      }
    };
    const timer = setInterval(check, 2 * 60 * 1000); // cada 2 min
    return () => { active = false; clearInterval(timer); };
  }, []);

  // Inactivity timeout — auto-logout after 30 min without interaction
  useEffect(() => {
    const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutos
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setSessionExpired(true);
      }, INACTIVITY_MS);
    };
    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, []);

  // Escape cierra el slide-over de configuración (click-fuera ya lo cierra).
  useEffect(() => {
    if (!configOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfigOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [configOpen]);

  const clearImpersonation = () => {
    localStorage.removeItem("impersonating-tenant");
    setImpersonating(null);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/superadmin/auth", { method: "DELETE" });
    } finally {
      // Hard navigation: tras borrar la cookie de sesión, router.push (SPA) podía
      // colgarse al re-renderizar el layout sin sesión. window.location recarga
      // limpio y nunca se paraliza.
      window.location.href = "/superadmin/login";
    }
  };

  // Derive page meta (section + title) for breadcrumb ejecutivo del topbar.
  const pageMeta: PageMeta =
    PAGE_META[pathname] ??
    (pathname.startsWith("/superadmin/tenants/")
      ? { title: "Tienda", section: "Tiendas" }
      : { title: "Superadmin", section: "Plataforma" });

  return (
    <div data-area="superadmin" className="superadmin-shell min-h-screen flex bg-[var(--surface-canvas)]">
      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette
        onToggleTheme={toggle}
        currentTheme={dark ? "dark" : "light"}
        onLogout={handleLogout}
      />

      {/* Impersonation Banner */}
      {impersonating && (
        <ImpersonationBanner slug={impersonating} onClear={clearImpersonation} />
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        className={[
          "fixed top-0 left-0 h-full z-40 flex flex-col",
          sidebarBgClass,
          "transition-all duration-[var(--dur-base)]",
          // Desktop width
          collapsed ? "w-16" : "w-60",
          // Mobile: hidden by default, shown when mobileOpen
          "max-md:hidden",
          mobileOpen ? "max-md:flex max-md:w-60" : "",
          impersonating ? "pt-8" : "",
        ].join(" ")}
      >
        {/* Logo */}
        <div
          className={[
            "flex items-center gap-3 px-4 py-5 border-b shrink-0",
            logoBorderClass,
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <div className={["w-9 h-9 rounded-full flex items-center justify-center shrink-0", logoBoxClass].join(" ")}>
            <BulejeMark size={20} strokeWidth={1.75} />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className={["text-base font-extrabold leading-none", logoLabelClass].join(" ")}>
                Buleje
              </div>
              <div className={["text-xs font-semibold leading-none mt-1.5", logoSubLabelClass].join(" ")}>
                Platform admin
              </div>
            </div>
          )}
        </div>

        {/* 2026-05-28 — Buscador de módulos del nav (desktop).
            Oculto cuando el sidebar está colapsado (solo icons).
            Filter aplica reactivamente sobre filteredGroups. */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1 shrink-0">
            <div
              className={[
                "flex items-center gap-2 h-10 rounded-xl border-2 px-3",
                isBuleje
                  ? "border-white/15 bg-white/5 focus-within:border-white/40"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)] focus-within:border-[var(--brand-ink)]",
              ].join(" ")}
            >
              <Search
                className={[
                  "h-4 w-4 shrink-0",
                  isBuleje ? "text-white/60" : "text-[var(--text-tertiary)]",
                ].join(" ")}
              />
              <input
                type="text"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder="Buscar módulo..."
                aria-label="Buscar módulos, secciones o pestañas"
                className={[
                  "w-full bg-transparent text-sm font-medium outline-none",
                  isBuleje
                    ? "text-white placeholder:text-white/40"
                    : "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
                ].join(" ")}
              />
              {navSearch && (
                <button
                  type="button"
                  onClick={() => setNavSearch("")}
                  aria-label="Limpiar búsqueda"
                  className={[
                    "rounded-full p-0.5 transition-colors",
                    isBuleje
                      ? "text-white/50 hover:text-white hover:bg-white/10"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                  ].join(" ")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {isSearching && (
              <p
                className={[
                  "mt-2 text-[length:var(--ts-2xs)] font-medium",
                  isBuleje ? "text-white/55" : "text-[var(--text-tertiary)]",
                ].join(" ")}
              >
                {hasSearchResults
                  ? `${filteredGroups.reduce((n, g) => n + g.items.length, 0)} resultado(s)`
                  : "Sin resultados"}
              </p>
            )}
          </div>
        )}

        {/* Nav (Brandon 2026-06-14): MISMO patrón que el panel admin de negocio.
            - Expandido (w-60): acordeón inline single-open que sigue la ruta
              activa (sección activa desplegada, las demás minimizadas).
            - Colapsado (w-16, solo iconos): flyout lateral on hover. */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1.5">
          {collapsed ? (
            <NavGroupsFlyout
              groups={filteredGroups}
              visibleHrefs={new Set(navItems.map((it) => it.href))}
              pathname={pathname}
              sidebarCollapsed={collapsed}
              onItemClick={() => setMobileOpen(false)}
              isBuleje={isBuleje}
              density={visual.density}
              iconClassName={iconClassName}
              forceExpandAll={isSearching}
            />
          ) : (
            <NavGroupsAccordion
              groups={filteredGroups}
              visibleHrefs={new Set(navItems.map((it) => it.href))}
              pathname={pathname}
              onItemClick={() => setMobileOpen(false)}
              isBuleje={isBuleje}
              forceExpandAll={isSearching}
              alertCount={alertCount}
            />
          )}
        </nav>

        {/* Tarjeta de contexto — llena el vacío del nav (acordeón single-open) y
            ofrece el atajo del buscador global (⌘K → CommandPalette). Solo
            desktop expandido. Pulido fino 2026-06-19. */}
        {!collapsed && (
          <div className="shrink-0 px-2 pb-1 hidden md:block">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
                )
              }
              aria-label="Buscar cualquier cosa (atajo Ctrl+K)"
              className={[
                "group w-full rounded-xl border p-2.5 text-left transition-colors",
                isBuleje
                  ? "border-[rgba(0,160,160,0.22)] bg-[rgba(0,160,160,0.07)] hover:bg-[rgba(0,160,160,0.13)]"
                  : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)]",
              ].join(" ")}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={[
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    isBuleje ? "bg-[rgba(0,160,160,0.2)] text-[#5eead4]" : "bg-[var(--accent-soft)] text-[var(--accent)]",
                  ].join(" ")}
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] leading-none",
                      isBuleje ? "text-white/50" : "text-[var(--text-tertiary)]",
                    ].join(" ")}
                  >
                    Acceso rápido
                  </p>
                  <p
                    className={[
                      "text-sm font-semibold truncate leading-tight mt-1",
                      isBuleje ? "text-white/90" : "text-[var(--text-primary)]",
                    ].join(" ")}
                  >
                    Buscar cualquier cosa
                  </p>
                </div>
                <kbd
                  className={[
                    "inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold font-mono tabular-nums",
                    isBuleje ? "border-white/15 bg-white/[0.06] text-white/55" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
                  ].join(" ")}
                >
                  <span className="text-sm leading-none">⌘</span>K
                </kbd>
              </div>
            </button>
          </div>
        )}

        {/* ── Footer: links + configurar + compactar (1:1 con el admin de negocio) ── */}
        <div className={["shrink-0 px-2 py-3 border-t space-y-0.5 hidden md:block", logoBorderClass].join(" ")}>
          {/* Ver tiendas (lista pública, nueva pestaña) */}
          <Link
            href="/tiendas"
            target="_blank"
            rel="noopener noreferrer"
            title="Abre la lista de tiendas en una pestaña nueva"
            className={[
              "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
              navItemIdleClass,
              collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
            ].join(" ")}
          >
            <Globe className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">Ver tiendas ↗</span>}
          </Link>

          {/* Configurar barra lateral — abre el panel (presets/tema/orden/visibilidad) */}
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            title="Configurar barra lateral"
            className={[
              "flex items-center gap-3 w-full rounded-lg text-sm font-medium transition-colors",
              navItemIdleClass,
              collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
            ].join(" ")}
          >
            <Sliders className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">Configurar barra lateral</span>}
          </button>

          {/* Compactar / Expandir */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expandir barra lateral" : "Compactar barra lateral"}
            className={[
              "flex items-center gap-3 w-full rounded-lg text-sm font-medium transition-colors",
              collapseBtnClass,
              collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
            ].join(" ")}
          >
            {collapsed ? (
              <ChevronRight className="w-[18px] h-[18px] shrink-0" />
            ) : (
              <>
                <ChevronLeft className="w-[18px] h-[18px] shrink-0" />
                <span className="truncate">Compactar</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar (separate layer so it can overlay) */}
      {mobileOpen && (
        <aside
          className={[
            "fixed top-0 left-0 h-full z-40 flex flex-col w-60 md:hidden",
            // Brandon 2026-05-20 v13 audit superadmin responsive: safe-area
            // padding-bottom para iOS notch — el footer del drawer (collapse
            // toggle o user info) no queda cortado por la barra del sistema.
            "pb-[env(safe-area-inset-bottom)]",
            sidebarBgClass,
            impersonating ? "pt-8" : "",
          ].join(" ")}
        >
          {/* Logo */}
          <div className={["flex items-center justify-between px-4 py-5 border-b shrink-0", logoBorderClass].join(" ")}>
            <div className="flex items-center gap-3">
              <div className={["w-9 h-9 rounded-full flex items-center justify-center shrink-0", logoBoxClass].join(" ")}>
                <BulejeMark size={20} strokeWidth={1.75} />
              </div>
              <div>
                <div className={["text-sm font-black tracking-tight leading-none", logoLabelClass].join(" ")}>
                  Buleje
                </div>
                <div className={["text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] mt-1", logoSubLabelClass].join(" ")}>
                  Platform
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className={["p-1 rounded transition-colors", isBuleje ? "text-white/55 hover:text-white" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"].join(" ")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2026-05-28 — Buscador mobile (mismo state que desktop) */}
          <div className="px-3 pt-3 pb-1 shrink-0">
            <div
              className={[
                "flex items-center gap-2 h-10 rounded-xl border-2 px-3",
                isBuleje
                  ? "border-white/15 bg-white/5 focus-within:border-white/40"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)] focus-within:border-[var(--brand-ink)]",
              ].join(" ")}
            >
              <Search className={["h-4 w-4 shrink-0", isBuleje ? "text-white/60" : "text-[var(--text-tertiary)]"].join(" ")} />
              <input
                type="text"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder="Buscar módulo..."
                aria-label="Buscar módulos"
                className={[
                  "w-full bg-transparent text-sm font-medium outline-none",
                  isBuleje ? "text-white placeholder:text-white/40" : "text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]",
                ].join(" ")}
              />
              {navSearch && (
                <button
                  type="button"
                  onClick={() => setNavSearch("")}
                  aria-label="Limpiar"
                  className={["rounded-full p-0.5 transition-colors", isBuleje ? "text-white/50 hover:text-white" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"].join(" ")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Nav mobile — sin flyout (no hay hover en touch).
              Acordeón vertical clásico: tap en grupo expande sus items. */}
          <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-2">
            <NavGroupsAccordion
              groups={filteredGroups}
              visibleHrefs={new Set(navItems.map((it) => it.href))}
              pathname={pathname}
              onItemClick={() => setMobileOpen(false)}
              isBuleje={isBuleje}
              forceExpandAll={isSearching}
              alertCount={alertCount}
            />
            {isSearching && !hasSearchResults && (
              <div className={["mt-6 px-3 text-center text-sm", isBuleje ? "text-white/55" : "text-[var(--text-tertiary)]"].join(" ")}>
                Sin resultados para &quot;{navSearch}&quot;
              </div>
            )}
          </nav>
        </aside>
      )}

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div
        className={[
          "flex-1 flex flex-col min-w-0 transition-all duration-[var(--dur-base)]",
          // Offset for sidebar on desktop
          collapsed ? "md:ml-16" : "md:ml-60",
          impersonating ? "pt-8" : "",
        ].join(" ")}
      >
        {/* Header ejecutivo — breadcrumb sutil (sección · página).
            IMPORTANTE: SIN backdrop-blur. backdrop-filter en un sticky crea un
            nuevo containing block para position:fixed en descendientes — eso
            atrapaba el drawer de notificaciones dentro del header. Usamos
            fondo opaco con sombra inferior para separar visualmente del main. */}
        <header className={`sticky top-0 z-20 border-b shrink-0 shadow-sm transition-colors duration-[var(--dur-base)] ${headerClass}`}>
          <div className="flex items-center justify-between px-4 sm:px-6 h-16 gap-3">
            {/* Izquierda — hamburger mobile + breadcrumb ejecutivo.
                flex-1 + min-w-0 para que el title pueda crecer todo lo posible
                antes de truncar (no compite con los buttons de la derecha). */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className={`md:hidden p-1.5 rounded-lg transition-colors ${headerIconBtnClass}`}
                aria-label="Abrir menú"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex flex-col min-w-0 leading-tight shrink-0">
                <span className={`text-xs font-semibold uppercase tracking-[var(--tracking-eyebrow)] truncate ${headerSectionClass}`}>
                  {pageMeta.section}
                </span>
                <h1 className={`text-base sm:text-lg font-bold truncate -mt-0.5 ${headerTitleClass}`}>
                  {pageMeta.title}
                </h1>
              </div>

              {/* Barra de búsqueda global — misma firma visual que el header del
                  panel admin de negocio (Brandon 2026-06-14). Abre el
                  CommandPalette (Ctrl/Cmd+K) ya montado en el shell. */}
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
                  )
                }
                aria-label="Buscar (atajo Ctrl+K)"
                className={`group hidden sm:flex items-center gap-2.5 h-10 flex-1 max-w-md px-3.5 ml-2 rounded-xl border cursor-pointer transition-colors ${headerPillClass}`}
              >
                <Search className={`h-4 w-4 shrink-0 transition-colors group-hover:text-[var(--accent)] ${headerPillTextClass}`} />
                <span className={`flex-1 text-left text-sm font-medium truncate transition-colors ${headerPillTextClass}`}>
                  Buscar tiendas, módulos…
                </span>
                <kbd className={`inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold font-mono px-1.5 py-0.5 rounded-md tabular-nums border ${headerKbdClass}`}>
                  <span className="text-base leading-none">⌘</span>K
                </kbd>
              </button>
            </div>

            {/* Derecha — chip user · notificaciones · theme · salir.
                shrink-0 para que no se comprima; gap-1 compacto. */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Chip de usuario — solo desktop, truncate corto */}
              <div className={`hidden lg:inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border text-xs font-semibold ${headerChipClass}`}>
                <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-3 h-3 text-white" />
                </div>
                <span className="truncate max-w-[110px]">{username}</span>
              </div>

              {/* Divider visual — solo lg+ donde aparece el chip */}
              <div className={`hidden lg:block w-px h-6 mx-1.5 ${headerDividerClass}`} />

              {/* Popover Messenger — chat directo con los negocios (ADR-132) */}
              <SuperAdminChatPopover />

              <NotificationsBell />

              <button
                type="button"
                onClick={toggle}
                className={`p-2 rounded-lg transition-colors ${headerIconBtnClass}`}
                title={dark ? "Modo claro" : "Modo oscuro"}
                aria-label="Cambiar tema"
              >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 hover:text-[var(--data-error-500)] ${headerDark ? "text-white/70 hover:bg-white/[0.1]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
                title="Cerrar sesión"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>

      {/* Slide-over "Configurar barra lateral" — monta el panel completo
          (presets Buleje/Ejecutivo/Sereno/Vibrante, tema, accent, densidad,
          iconos, orden y visibilidad). 1:1 con el openConfig del admin. */}
      {configOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={() => setConfigOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Configurar barra lateral"
            className="fixed top-0 right-0 h-full w-full max-w-md z-[61] bg-[var(--surface-raised)] border-l border-[var(--rule-base)] shadow-[var(--shadow-xl)] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[var(--text-primary)] truncate">Configurar barra lateral</h2>
                <p className="text-xs text-[var(--text-tertiary)] truncate">Tema, presets, orden y visibilidad</p>
              </div>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                aria-label="Cerrar"
                className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <SidebarConfigPanel items={NAV_ITEMS} />
            </div>
          </aside>
        </>
      )}

      {/* Session Expired Modal */}
      {sessionExpired && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl max-w-sm w-full p-6 shadow-[var(--shadow-xl)] text-center">
            <div className="mx-auto w-14 h-14 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mb-4">
              <Clock className="w-7 h-7 text-[var(--data-warning-500)]" />
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Sesión expirada</h2>
            <p className="text-sm text-[var(--text-tertiary)] mb-5">
              Tu sesión ha expirado por seguridad. Inicia sesión de nuevo para continuar.
            </p>
            <button
              onClick={() => {
                // QA Brandon 2026-06-10: hard navigation (no router.push). Con la
                // sesión expirada, el RSC fetch del App Router se quedaba colgado
                // (la página se "paralizaba"). window.location descarta TODO el
                // estado client-side roto (shell, polls, este modal) y carga el
                // login como documento fresco — nunca se cuelga.
                window.location.href = "/superadmin/login?reason=expired";
              }}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--accent-600,var(--accent))] text-white text-sm font-medium hover:brightness-110 transition-colors"
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Desktop: flyout lateral on hover ─────────────────────────────────────────
//
// Patrón replicado del admin de negocio (components/admin/shared/SidebarFlyout.tsx).
// Los grupos NO se expanden verticalmente; al hacer hover sobre el botón del
// grupo aparece un panel lateral pegado al borde derecho del sidebar con los
// items del grupo. Click en el ítem navega y cierra el flyout.
//
// Delays: open 80ms (casi instantáneo), close 120ms (permite cruzar entre el
// botón y el flyout sin parpadeo). Cuando el cursor cae sobre el flyout el
// timer de cierre se cancela.
//
// Tipografía: header del grupo usa text-sm (14px) en lugar de text-2xs (10px) —
// "más grande y coherente". Items del flyout usan text-base (16px) — peso de
// menú principal, fácil de leer. Cumple bsm-typography-rules.

interface NavGroupsFlyoutProps {
  groups: NavGroupDef[];
  visibleHrefs: Set<string>;
  pathname: string;
  sidebarCollapsed: boolean;
  onItemClick: () => void;
  isBuleje: boolean;
  density: SidebarVisualPrefs["density"];
  iconClassName: string;
  /** 2026-05-28 — fuerza expansion de todos los items (modo búsqueda) */
  forceExpandAll?: boolean;
}

function NavGroupsFlyout({
  groups,
  visibleHrefs,
  pathname,
  sidebarCollapsed,
  onItemClick,
  isBuleje,
  density,
  iconClassName,
  forceExpandAll = false,
}: NavGroupsFlyoutProps) {
  const [hoveredId, setHoveredId] = useState<NavGroupId | null>(null);
  const [position, setPosition] = useState<{ top: number } | null>(null);
  const refs = useRef<Partial<Record<NavGroupId, HTMLButtonElement | null>>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = (id: NavGroupId) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHoveredId(id), 80);
  };
  const close = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHoveredId(null), 120);
  };
  const cancelClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Reposicionar el flyout a la altura del header del grupo hovered.
  useEffect(() => {
    if (!hoveredId) { setPosition(null); return; }
    const el = refs.current[hoveredId];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({ top: rect.top });
  }, [hoveredId]);

  // Cerrar el flyout al cambiar de ruta (después de que el usuario navega).
  useEffect(() => { setHoveredId(null); }, [pathname]);

  // Densidad afecta padding vertical del header (compact / normal / spacious).
  const headerPad =
    density === "compact" ? "px-3 py-2" : density === "spacious" ? "px-3 py-3.5" : "px-3 py-2.5";

  // Estilos coherentes con el theme buleje (slate + teal).
  const headerActiveClass = isBuleje
    ? "bg-[rgba(0,160,160,0.18)] text-[#5eead4] font-semibold shadow-[inset_2px_0_0_#14C2C2]"
    : "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold";
  const headerIdleClass = isBuleje
    ? "text-white/75 hover:bg-white/[0.08] hover:text-white"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";
  const dotClass = isBuleje ? "bg-[#14C2C2]" : "bg-[var(--accent)]";

  const sidebarWidth = sidebarCollapsed ? 64 : 240;
  const hoveredGroup = hoveredId ? groups.find((g) => g.id === hoveredId) ?? null : null;
  const hoveredVisibleItems = hoveredGroup?.items.filter((it) => visibleHrefs.has(it.href)) ?? [];

  // 2026-05-28 — Modo búsqueda: cuando hay query activa, en lugar de
  // mostrar headers de grupo con flyout (que requieren hover), renderizamos
  // los items directamente apilados — el usuario ve los matches al toque.
  if (forceExpandAll && !sidebarCollapsed) {
    return (
      <div className="space-y-3">
        {groups.map((group) => {
          const groupItems = group.items.filter((it) => visibleHrefs.has(it.href));
          if (groupItems.length === 0) return null;
          return (
            <div key={group.id} className="space-y-0.5">
              <div
                className={[
                  "flex items-center gap-2 px-3 pb-1 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)]",
                  isBuleje ? "text-white/45" : "text-[var(--text-tertiary)]",
                ].join(" ")}
              >
                <span className="opacity-60">{group.icon}</span>
                <span>{group.label}</span>
              </div>
              {groupItems.map((it) => {
                const isActive =
                  pathname === it.href ||
                  (it.href !== "/superadmin/dashboard" && pathname.startsWith(it.href));
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={onItemClick}
                    className={[
                      "flex items-center gap-2.5 rounded-lg transition-colors",
                      headerPad,
                      "text-sm font-medium",
                      isActive ? headerActiveClass : headerIdleClass,
                    ].join(" ")}
                  >
                    <span className={[iconClassName, "shrink-0"].join(" ")}>{it.icon}</span>
                    <span className="flex-1 text-left truncate">{it.label}</span>
                    {isActive && (
                      <span className={["w-1.5 h-1.5 rounded-full shrink-0", dotClass].join(" ")} />
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => {
        const groupItems = group.items.filter((it) => visibleHrefs.has(it.href));
        if (groupItems.length === 0) return null;

        const hasActive = groupItems.some(
          (it) => pathname === it.href || (it.href !== "/superadmin/dashboard" && pathname.startsWith(it.href)),
        );
        const isHovered = hoveredId === group.id;

        return (
          <button
            key={group.id}
            ref={(el) => { refs.current[group.id] = el; }}
            type="button"
            onMouseEnter={() => open(group.id)}
            onMouseLeave={close}
            onFocus={() => open(group.id)}
            onBlur={close}
            onClick={() => {
              // El header del grupo es solo trigger del flyout. La navegación
              // ocurre dentro del flyout (clicks en los items). Esto evita
              // un full-reload con window.location.href y mantiene la SPA.
              setHoveredId((prev) => (prev === group.id ? null : group.id));
            }}
            aria-haspopup="menu"
            aria-expanded={isHovered}
            aria-label={`Grupo ${group.label}`}
            className={[
              "group/nav w-full flex items-center gap-2.5 rounded-lg transition-all",
              headerPad,
              sidebarCollapsed ? "justify-center" : "",
              "text-sm font-semibold",
              hasActive ? headerActiveClass : (isHovered ? headerActiveClass : headerIdleClass),
            ].join(" ")}
            title={sidebarCollapsed ? group.label : undefined}
          >
            <span className={[iconClassName, "shrink-0"].join(" ")}>{group.icon}</span>
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left truncate">{group.label}</span>
                {/* Counter chip — cuántas rutas tiene el grupo. Look ejecutivo,
                    cifra tabular, semi-transparente para no competir con label. */}
                <span
                  className={[
                    "shrink-0 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-md text-[length:var(--ts-2xs)] font-bold tabular-nums leading-none",
                    isBuleje
                      ? "bg-white/[0.08] text-white/55 group-hover/nav:text-white/80"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] group-hover/nav:text-[var(--text-secondary)]",
                    hasActive ? (isBuleje ? "bg-[#14C2C2]/20 text-[#5eead4]" : "bg-[var(--accent)]/15 text-[var(--accent)]") : "",
                  ].join(" ")}
                  aria-hidden
                >
                  {groupItems.length}
                </span>
                {hasActive && (
                  <span
                    className={["w-1.5 h-1.5 rounded-full shrink-0", dotClass].join(" ")}
                    aria-hidden
                  />
                )}
                <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50 transition-transform group-hover/nav:translate-x-0.5" />
              </>
            )}
          </button>
        );
      })}

      {/* Flyout lateral — pegado al borde derecho del sidebar, alineado con el
          botón del grupo donde está parado el cursor. */}
      {hoveredGroup && position && hoveredVisibleItems.length > 0 && (
        <SuperAdminFlyout
          group={hoveredGroup}
          items={hoveredVisibleItems}
          position={position}
          left={sidebarWidth}
          pathname={pathname}
          isBuleje={isBuleje}
          onItemClick={() => {
            cancelClose();
            setHoveredId(null);
            onItemClick();
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={close}
        />
      )}
    </div>
  );
}

// ─── Flyout component ─────────────────────────────────────────────────────────
//
// Panel pegado al lado derecho del sidebar. Render via position:fixed para
// escapar del overflow del nav. Tipografía text-base (16px) en items para
// lectura cómoda.

interface SuperAdminFlyoutProps {
  group: NavGroupDef;
  items: NavItem[];
  position: { top: number };
  left: number;
  pathname: string;
  isBuleje: boolean;
  onItemClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function SuperAdminFlyout({
  group,
  items,
  position,
  left,
  pathname,
  isBuleje,
  onItemClick,
  onMouseEnter,
  onMouseLeave,
}: SuperAdminFlyoutProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Mismo lenguaje editorial buleje del flyout admin.
  const bg = isBuleje
    ? "bg-[linear-gradient(180deg,#060d13_0%,#02080c_100%)]"
    : "bg-[var(--surface-raised)]";
  const border = isBuleje
    ? "border-[rgba(0,160,160,0.2)] shadow-[var(--shadow-lg)] ring-1 ring-[rgba(20,194,194,0.08)]"
    : "border-[var(--rule-base)] shadow-lg";
  const headerLabelClass = isBuleje ? "text-white/55" : "text-[var(--text-tertiary)]";
  const itemActive = isBuleje
    ? "bg-linear-to-r from-[rgba(20,194,194,0.22)] via-[rgba(0,160,160,0.14)] to-[rgba(0,160,160,0.04)] text-white font-semibold shadow-[inset_3px_0_0_#14C2C2]"
    : "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold";
  const itemIdle = isBuleje
    ? "text-white/75 hover:bg-white/[0.08] hover:text-white"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

  return (
    <div
      role="menu"
      aria-label={group.label}
      style={{ position: "fixed", top: position.top - 4, left, zIndex: 100 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={[
        "rounded-xl rounded-l-none border min-w-[240px] overflow-hidden py-2",
        bg,
        border,
        "transition-all duration-200",
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-1",
      ].join(" ")}
    >
      {/* Header del flyout — etiqueta del grupo. text-xs uppercase es OK aquí
          porque solo es un label informativo; el peso visual está en los items. */}
      <div className={["px-4 pt-1.5 pb-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)]", headerLabelClass].join(" ")}>
        {group.label}
      </div>
      <div className="space-y-0.5 px-1.5">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/superadmin/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              role="menuitem"
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors",
                active ? itemActive : itemIdle,
              ].join(" ")}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mobile: accordion vertical ───────────────────────────────────────────────
//
// En mobile no hay hover. Tap en el header del grupo expande/colapsa los items.
// Auto-expande el grupo que contiene la ruta activa.

interface NavGroupsAccordionProps {
  groups: NavGroupDef[];
  visibleHrefs: Set<string>;
  pathname: string;
  onItemClick: () => void;
  isBuleje: boolean;
  /** 2026-05-28 — fuerza todos los grupos expandidos (modo búsqueda) */
  forceExpandAll?: boolean;
  /** Conteo de alertas críticas activas — badge en el item/grupo de Alertas (#2). */
  alertCount?: number;
}

const ALERTS_HREF = "/superadmin/alerts";

/** Badge rojo de conteo (alertas críticas activas) — #2. */
function AlertCountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--data-error-500)] text-white text-[length:var(--ts-2xs)] font-bold tabular-nums shrink-0">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function NavGroupsAccordion({
  groups,
  visibleHrefs,
  pathname,
  onItemClick,
  isBuleje,
  forceExpandAll = false,
  alertCount = 0,
}: NavGroupsAccordionProps) {
  const activeGroupId = groups.find((g) =>
    g.items.some((it) => pathname === it.href || (it.href !== "/superadmin/dashboard" && pathname.startsWith(it.href))),
  )?.id ?? "inicio";
  // Brandon 2026-06-17: acordeón SINGLE-OPEN — solo la sección activa (o la que
  // el usuario abra) queda expandida; las demás se minimizan. Una a la vez.
  const [expanded, setExpanded] = useState<Set<NavGroupId>>(() => new Set([activeGroupId]));
  const allGroupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);
  // En modo búsqueda, todos los grupos visibles se expanden automáticamente.
  const effectiveExpanded = forceExpandAll ? allGroupIds : expanded;

  // Al navegar, abrir SOLO la sección activa y cerrar las demás (single-open).
  useEffect(() => {
    if (activeGroupId) setExpanded(new Set([activeGroupId]));
  }, [activeGroupId]);

  // Single-open: abrir una sección cierra las demás; click en la abierta la cierra.
  const toggle = (id: NavGroupId) => {
    setExpanded((prev) => (prev.has(id) ? new Set<NavGroupId>() : new Set<NavGroupId>([id])));
  };

  // ── Flyout lateral on hover (1:1 con el admin de negocio · Brandon 2026-06-17) ──
  // Al pasar el mouse por el header de una sección aparece un panel lateral con
  // sus items, pegado al borde derecho del sidebar (mismo SuperAdminFlyout del
  // modo colapsado). Es ADITIVO: los items inline siguen visibles; el flyout da
  // navegación rápida sin scrollear. Mismos delays que el admin (open 80 / close 120).
  const [hoveredId, setHoveredId] = useState<NavGroupId | null>(null);
  const [flyoutTop, setFlyoutTop] = useState<{ top: number } | null>(null);
  const headerRefs = useRef<Partial<Record<NavGroupId, HTMLButtonElement | null>>>({});
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFlyout = (id: NavGroupId) => {
    if (forceExpandAll) return; // en modo búsqueda no interferir con los matches
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredId(id), 80);
  };
  const closeFlyout = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredId(null), 120);
  };
  const cancelCloseFlyout = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  useEffect(() => {
    if (!hoveredId) { setFlyoutTop(null); return; }
    const el = headerRefs.current[hoveredId];
    if (!el) return;
    setFlyoutTop({ top: el.getBoundingClientRect().top });
  }, [hoveredId]);
  useEffect(() => { setHoveredId(null); }, [pathname]);
  const hoveredGroup = hoveredId ? groups.find((g) => g.id === hoveredId) ?? null : null;
  const hoveredItems = hoveredGroup?.items.filter((it) => visibleHrefs.has(it.href)) ?? [];

  // Item activo: pill teal (marca) más nítida — barra lateral 3px + ring interno
  // sutil para separarlo del fondo. Idle: texto tenue. Pulido fino 2026-06-19.
  const itemActive = isBuleje
    ? "bg-[rgba(0,160,160,0.16)] text-[#5eead4] font-semibold shadow-[inset_3px_0_0_#14C2C2] ring-1 ring-inset ring-[rgba(20,194,194,0.16)]"
    : "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold shadow-[inset_3px_0_0_var(--accent)]";
  const itemIdle = isBuleje
    ? "text-white/75 hover:bg-white/[0.08] hover:text-white"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";
  // Label de categoría: blanco legible siempre. El estado activo se marca en el
  // sub-ítem + el dot, NO recolorea el header (más igualitario). Brandon 2026-06-19.
  const labelClass = isBuleje
    ? "text-white/75 hover:text-white"
    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]";
  const dotClass = isBuleje ? "bg-[#14C2C2]" : "bg-[var(--accent)]";

  return (
    <div className="space-y-1.5">
      {groups.map((group) => {
        const items = group.items.filter((it) => visibleHrefs.has(it.href));
        if (items.length === 0) return null;
        const isOpen = effectiveExpanded.has(group.id);
        const panelId = `m-nav-group-${group.id}`;
        const groupHasActive = items.some(
          (it) => pathname === it.href || (it.href !== "/superadmin/dashboard" && pathname.startsWith(it.href)),
        );
        const iconColor = GROUP_ICON_COLOR[group.id];
        const groupShowsAlertBadge = alertCount > 0 && items.some((it) => it.href === ALERTS_HREF);

        // Categoría con UN solo enlace (Brandon 2026-06-19): link directo, sin
        // header colapsable ni chevron — no tiene sentido desplegar 1 destino.
        if (items.length === 1) {
          const item = items[0];
          const active =
            pathname === item.href ||
            (item.href !== "/superadmin/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={group.id}
              href={item.href}
              onClick={onItemClick}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors",
                active ? itemActive : itemIdle,
              ].join(" ")}
            >
              <span className={["shrink-0 [&_svg]:w-[18px] [&_svg]:h-[18px]", iconColor].join(" ")}>{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {active && (
                <span className={["w-1.5 h-1.5 rounded-full shrink-0", dotClass].join(" ")} aria-hidden />
              )}
            </Link>
          );
        }

        return (
          <div key={group.id}>
            {/* Categoría = icono a color + label normal-case + chevron. Compacta. */}
            <button
              type="button"
              ref={(el) => { headerRefs.current[group.id] = el; }}
              onClick={() => toggle(group.id)}
              onMouseEnter={() => openFlyout(group.id)}
              onMouseLeave={closeFlyout}
              onFocus={() => openFlyout(group.id)}
              onBlur={closeFlyout}
              aria-expanded={isOpen}
              aria-controls={panelId}
              aria-haspopup="menu"
              className={[
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors",
                labelClass,
              ].join(" ")}
            >
              <span className={["shrink-0 [&_svg]:w-[18px] [&_svg]:h-[18px]", iconColor].join(" ")}>{group.icon}</span>
              <span className="flex-1 text-left truncate">{group.label}</span>
              {!isOpen && groupShowsAlertBadge ? (
                <AlertCountBadge count={alertCount} />
              ) : groupHasActive && !isOpen ? (
                <span className={["w-1.5 h-1.5 rounded-full shrink-0", dotClass].join(" ")} aria-hidden />
              ) : null}
              <ChevronDown
                className={[
                  "w-3.5 h-3.5 shrink-0 opacity-60 transition-transform duration-200",
                  isOpen ? "rotate-0" : "-rotate-90",
                ].join(" ")}
              />
            </button>
            {isOpen && (
              // Sub-enlaces indentados con guía vertical (ref. admin de negocio):
              // más chicos, icono w-4 monocromo, alineados bajo el icono de la
              // categoría. Brandon 2026-06-19.
              <div id={panelId} className="mt-1 mb-1.5 ml-[1.15rem] pl-3 border-l border-white/[0.08] space-y-1">
                {items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/superadmin/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onItemClick}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-normal transition-colors",
                        active ? itemActive : itemIdle,
                      ].join(" ")}
                    >
                      <span className="shrink-0 opacity-90 [&_svg]:w-4 [&_svg]:h-4">{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.href === ALERTS_HREF && alertCount > 0 ? (
                        <AlertCountBadge count={alertCount} />
                      ) : active ? (
                        <span className={["w-1.5 h-1.5 rounded-full shrink-0", dotClass].join(" ")} aria-hidden />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Flyout lateral on hover — mismo panel que el modo colapsado, pegado al
          borde derecho del sidebar expandido (w-60 = 240px). */}
      {hoveredGroup && flyoutTop && hoveredItems.length > 0 && (
        <SuperAdminFlyout
          group={hoveredGroup}
          items={hoveredItems}
          position={flyoutTop}
          left={240}
          pathname={pathname}
          isBuleje={isBuleje}
          onItemClick={() => { cancelCloseFlyout(); setHoveredId(null); onItemClick(); }}
          onMouseEnter={cancelCloseFlyout}
          onMouseLeave={closeFlyout}
        />
      )}
    </div>
  );
}
