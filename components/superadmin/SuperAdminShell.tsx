"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import CommandPalette from "./CommandPalette";
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
  Wrench,
  FileCheck,
  ImageIcon,
  Sparkles,
  Layers,
  CreditCard,
  Sliders,
  BookOpen,
  Palette,
  Wallet,
  Server,
} from "@buleje/design-system/icons";
import { BulejeMark } from "@/components/ui-system/illustrations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
}

type NavGroupId = "plataforma" | "negocios" | "catalogo" | "pagos" | "sistema";

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

const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "plataforma",
    label: "Plataforma",
    icon: <Gauge className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Dashboard",      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, href: "/superadmin/dashboard"      },
      { label: "Centro Control", icon: <Gauge          className="w-5 h-5 shrink-0" />, href: "/superadmin/control-center" },
      { label: "Analytics",      icon: <BarChart3      className="w-5 h-5 shrink-0" />, href: "/superadmin/analytics"      },
      { label: "Salud",          icon: <HeartPulse     className="w-5 h-5 shrink-0" />, href: "/superadmin/health"         },
      { label: "Actividad",      icon: <Activity       className="w-5 h-5 shrink-0" />, href: "/superadmin/activity"       },
    ],
  },
  {
    id: "negocios",
    label: "Negocios",
    icon: <Building2 className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Tiendas",       icon: <Building2   className="w-5 h-5 shrink-0" />, href: "/superadmin/tenants"             },
      { label: "Aplicaciones",  icon: <FileCheck   className="w-5 h-5 shrink-0" />, href: "/superadmin/vendor-applications" },
      { label: "Marketplace",   icon: <ShoppingBag className="w-5 h-5 shrink-0" />, href: "/superadmin/marketplace"         },
      { label: "Repartidores",  icon: <Wrench      className="w-5 h-5 shrink-0" />, href: "/superadmin/repartidores"        },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo & Marca",
    icon: <Palette className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Banco de imágenes",    icon: <ImageIcon className="w-5 h-5 shrink-0" />, href: "/superadmin/banco-imagenes"  },
      { label: "Catálogo variaciones", icon: <BookOpen  className="w-5 h-5 shrink-0" />, href: "/superadmin/variant-catalog" },
      { label: "Marca",                icon: <Sparkles  className="w-5 h-5 shrink-0" />, href: "/superadmin/marca"           },
      { label: "Plantilla panel",      icon: <Layers    className="w-5 h-5 shrink-0" />, href: "/superadmin/plantilla"       },
      { label: "Banners",              icon: <ImageIcon className="w-5 h-5 shrink-0" />, href: "/superadmin/banners"         },
    ],
  },
  {
    id: "pagos",
    label: "Pagos & Riesgo",
    icon: <Wallet className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Pagos pendientes", icon: <CreditCard  className="w-5 h-5 shrink-0" />, href: "/superadmin/pagos-pendientes" },
      { label: "Pagos Yape",       icon: <CreditCard  className="w-5 h-5 shrink-0" />, href: "/superadmin/pagos-yape"       },
      { label: "Seguridad",        icon: <ShieldCheck className="w-5 h-5 shrink-0" />, href: "/superadmin/security"         },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    icon: <Server className="w-4 h-4 shrink-0" />,
    items: [
      { label: "Configuración", icon: <Sliders  className="w-5 h-5 shrink-0" />, href: "/superadmin/configuracion" },
      { label: "Sistema",       icon: <Settings className="w-5 h-5 shrink-0" />, href: "/superadmin/settings"      },
    ],
  },
];

// Lista plana derivada — preserva compatibilidad con loadNavConfig (hidden/order
// se aplican dentro de cada grupo, no se rompen las prefs de Brandon).
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const PAGE_TITLES: Record<string, string> = {
  "/superadmin/dashboard":       "Dashboard",
  "/superadmin/control-center":  "Centro de Control",
  "/superadmin/tenants":         "Tiendas",
  "/superadmin/vendor-applications": "Aplicaciones de vendedores",
  "/superadmin/pagos-pendientes": "Pagos pendientes · Yape, Plin, transferencias",
  "/superadmin/repartidores":    "Repartidores · Aprobación y gestión",
  "/superadmin/marketplace":     "Marketplace",
  "/superadmin/marketplace/suppliers": "Marketplace · Proveedores",
  "/superadmin/marketplace/category-images": "Marketplace · Imágenes de categorías",
  "/superadmin/pagos-yape":       "Pagos Yape · Aprobación con vision IA",
  "/superadmin/variant-catalog": "Catálogo de variaciones · Plantillas globales",
  "/superadmin/banco-imagenes":  "Banco de Imágenes · Recursos globales por rubro",
  "/superadmin/stores":          "Tiendas publicadas",
  "/superadmin/marca":           "Marca de la plataforma",
  "/superadmin/plantilla":       "Plantilla del panel admin",
  "/superadmin/banners":         "Banners promocionales",
  "/superadmin/analytics":       "Analytics",
  "/superadmin/health":          "Salud del Sistema",
  "/superadmin/activity":        "Actividad",
  "/superadmin/configuracion":   "Configuración · Yape, Plin, marca y contacto",
  "/superadmin/settings":        "Config del sistema",
  "/superadmin":                 "Dashboard",
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
  teal: "#00B4A6",
  emerald: "#10B981",
  sky: "#0EA5E9",
  violet: "#8B5CF6",
  amber: "#F59E0B",
  rose: "#F43F5E",
};

const DEFAULT_VISUAL: SidebarVisualPrefs = {
  theme: "cristal",
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
      className="fixed top-0 inset-x-0 z-50 bg-[var(--data-warning)] text-[var(--text-inverse)] text-xs font-semibold flex items-center justify-center gap-3 py-2 px-4"
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
  const router = useRouter();
  const { dark, toggle } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [navItems, setNavItems] = useState<NavItem[]>(NAV_ITEMS);
  const [visual, setVisual] = useState<SidebarVisualPrefs>(DEFAULT_VISUAL);

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
    // eslint-disable-next-line no-console
    console.log("[SuperAdminShell] applying accent", visual.accent, "→", hex);
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
  const isBuleje =
    visual.theme === "buleje" || visual.theme === "cristal" || visual.theme === "shaded";

  const sidebarBgClass = isBuleje
    ? // Slate-deep editorial gradient + border teal hairline + text-white. Paleta real del proyecto.
      "bg-[linear-gradient(180deg,#0b1f2b_0%,#0a1922_50%,#091621_100%)] border-r border-[rgba(0,180,166,0.18)] text-white shadow-[inset_-1px_0_0_rgba(0,180,166,0.06)]"
    : visual.theme === "dark"
      ? "bg-zinc-900 border-r border-zinc-800 text-zinc-100"
      : "bg-[var(--surface-canvas)] border-r border-[var(--rule-base)]";

  // Override de clases para items cuando es theme buleje — paleta cohesiva, contraste AAA.
  const navItemActiveClass = isBuleje
    ? "bg-[rgba(0,180,166,0.18)] text-[#5eead4] font-semibold shadow-[inset_2px_0_0_#34d4be]"
    : "bg-[var(--accent-soft)] text-[var(--accent)]";
  const navItemIdleClass = isBuleje
    ? "text-white/65 hover:bg-white/[0.06] hover:text-white"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";
  const logoBoxClass = isBuleje
    ? "bg-[linear-gradient(135deg,#00B4A6_0%,#0d9488_100%)] text-white shadow-lg shadow-[#00B4A6]/30"
    : "bg-[var(--accent)] text-white";
  const logoLabelClass = isBuleje ? "text-white" : "text-[var(--text-primary)]";
  const logoSubLabelClass = isBuleje ? "text-[#5eead4]" : "text-[var(--accent)]";
  const logoBorderClass = isBuleje ? "border-white/[0.08]" : "border-[var(--rule-base)]";
  const collapseBtnClass = isBuleje
    ? "text-white/45 hover:bg-white/[0.06] hover:text-white/85"
    : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]";

  const iconClassName =
    visual.iconStyle === "monochrome" ? "opacity-70 grayscale" : "";

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

  // Verificar sesión periódicamente (cada 2 min) — si expiró, mostrar aviso
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch("/api/superadmin/auth", { method: "GET" });
        if (!res.ok && active) setSessionExpired(true);
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

  const clearImpersonation = () => {
    localStorage.removeItem("impersonating-tenant");
    setImpersonating(null);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/superadmin/auth", { method: "DELETE" });
    } finally {
      router.push("/superadmin/login");
    }
  };

  // Derive page title from pathname
  const pageTitle =
    PAGE_TITLES[pathname] ??
    (pathname.startsWith("/superadmin/tenants/") ? "Tienda" : "SuperAdmin");

  return (
    <div className="superadmin-shell min-h-screen flex bg-[var(--surface-canvas)]">
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
          <div className={["w-9 h-9 rounded-xl flex items-center justify-center shrink-0", logoBoxClass].join(" ")}>
            <BulejeMark size={20} strokeWidth={1.75} />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className={["text-sm font-black tracking-tight leading-none", logoLabelClass].join(" ")}>
                Buleje
              </div>
              <div className={["text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] mt-1", logoSubLabelClass].join(" ")}>
                Platform
              </div>
            </div>
          )}
        </div>

        {/* Nav — botones de grupo. Hover abre flyout lateral con los items
            del grupo (mismo patrón que admin de negocios). Tipografía sm/base
            para mejorar lectura (antes era 2xs/sm = muy chico). */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1.5">
          <NavGroupsFlyout
            groups={NAV_GROUPS}
            visibleHrefs={new Set(navItems.map((it) => it.href))}
            pathname={pathname}
            sidebarCollapsed={collapsed}
            onItemClick={() => setMobileOpen(false)}
            isBuleje={isBuleje}
            density={visual.density}
            iconClassName={iconClassName}
          />
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="shrink-0 px-2 pb-4 hidden md:block">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={[
              "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-colors",
              collapseBtnClass,
              collapsed ? "justify-center" : "",
            ].join(" ")}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Colapsar</span>
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
            sidebarBgClass,
            impersonating ? "pt-8" : "",
          ].join(" ")}
        >
          {/* Logo */}
          <div className={["flex items-center justify-between px-4 py-5 border-b shrink-0", logoBorderClass].join(" ")}>
            <div className="flex items-center gap-3">
              <div className={["w-9 h-9 rounded-xl flex items-center justify-center shrink-0", logoBoxClass].join(" ")}>
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

          {/* Nav mobile — sin flyout (no hay hover en touch).
              Acordeón vertical clásico: tap en grupo expande sus items. */}
          <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-2">
            <NavGroupsAccordion
              groups={NAV_GROUPS}
              visibleHrefs={new Set(navItems.map((it) => it.href))}
              pathname={pathname}
              onItemClick={() => setMobileOpen(false)}
              isBuleje={isBuleje}
            />
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
        {/* Header */}
        <header className="sticky top-0 z-20 bg-[var(--surface-canvas)] border-b border-[var(--rule-base)] shrink-0">
          <div className="flex items-center justify-between px-4 sm:px-6 h-14 gap-4">
            {/* Left: hamburger (mobile) + page title */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="md:hidden p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">
                {pageTitle}
              </h1>
            </div>

            {/* Right: username + theme toggle + logout */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Username badge */}
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-sunken)] text-xs font-medium text-[var(--text-secondary)]">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span className="truncate max-w-[120px]">{username}</span>
              </div>

              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggle}
                className="p-2 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
                title={dark ? "Modo claro" : "Modo oscuro"}
              >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Logout — neutral outline; danger semantic solo en hover (Ola 2) */}
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--data-error)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
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

      {/* Session Expired Modal */}
      {sessionExpired && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl max-w-sm w-full p-6 shadow-[var(--shadow-xl)] text-center">
            <div className="mx-auto w-14 h-14 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mb-4">
              <Clock className="w-7 h-7 text-[var(--data-warning)]" />
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Sesión expirada</h2>
            <p className="text-sm text-[var(--text-tertiary)] mb-5">
              Tu sesión ha expirado por seguridad. Inicia sesión de nuevo para continuar.
            </p>
            <button
              onClick={() => router.push("/superadmin/login")}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:brightness-110 transition-colors"
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
    ? "bg-[rgba(0,180,166,0.18)] text-[#5eead4] font-semibold shadow-[inset_2px_0_0_#34d4be]"
    : "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold";
  const headerIdleClass = isBuleje
    ? "text-white/75 hover:bg-white/[0.06] hover:text-white"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";
  const dotClass = isBuleje ? "bg-[#34d4be]" : "bg-[var(--accent)]";

  const sidebarWidth = sidebarCollapsed ? 64 : 240;
  const hoveredGroup = hoveredId ? groups.find((g) => g.id === hoveredId) ?? null : null;
  const hoveredVisibleItems = hoveredGroup?.items.filter((it) => visibleHrefs.has(it.href)) ?? [];

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
              "w-full flex items-center gap-3 rounded-lg transition-colors",
              headerPad,
              sidebarCollapsed ? "justify-center" : "",
              "text-sm font-bold",
              hasActive ? headerActiveClass : (isHovered ? headerActiveClass : headerIdleClass),
            ].join(" ")}
            title={sidebarCollapsed ? group.label : undefined}
          >
            <span className={[iconClassName, "shrink-0"].join(" ")}>{group.icon}</span>
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left truncate">{group.label}</span>
                {hasActive && (
                  <span
                    className={["w-1.5 h-1.5 rounded-full shrink-0", dotClass].join(" ")}
                    aria-hidden
                  />
                )}
                <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
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
    ? "bg-[linear-gradient(180deg,#0b1f2b_0%,#091621_100%)]"
    : "bg-[var(--surface-raised)]";
  const border = isBuleje
    ? "border-[rgba(0,180,166,0.2)] shadow-[var(--shadow-lg)] ring-1 ring-[rgba(52,212,190,0.08)]"
    : "border-[var(--rule-base)] shadow-lg";
  const headerLabelClass = isBuleje ? "text-white/55" : "text-[var(--text-tertiary)]";
  const itemActive = isBuleje
    ? "bg-linear-to-r from-[rgba(52,212,190,0.22)] via-[rgba(0,180,166,0.14)] to-[rgba(0,180,166,0.04)] text-white font-semibold shadow-[inset_3px_0_0_#34d4be]"
    : "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold";
  const itemIdle = isBuleje
    ? "text-white/75 hover:bg-white/[0.06] hover:text-white"
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
      <div className={["px-4 pt-1.5 pb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]", headerLabelClass].join(" ")}>
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
}

function NavGroupsAccordion({
  groups,
  visibleHrefs,
  pathname,
  onItemClick,
  isBuleje,
}: NavGroupsAccordionProps) {
  const activeGroupId = groups.find((g) =>
    g.items.some((it) => pathname === it.href || (it.href !== "/superadmin/dashboard" && pathname.startsWith(it.href))),
  )?.id ?? "plataforma";
  const [expanded, setExpanded] = useState<Set<NavGroupId>>(() => new Set([activeGroupId]));

  // Cuando cambia la ruta, asegurarse que el grupo de la ruta está expandido.
  useEffect(() => {
    if (activeGroupId) {
      setExpanded((prev) => {
        if (prev.has(activeGroupId)) return prev;
        const next = new Set(prev);
        next.add(activeGroupId);
        return next;
      });
    }
  }, [activeGroupId]);

  const toggle = (id: NavGroupId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const headerActive = isBuleje
    ? "bg-[rgba(0,180,166,0.12)] text-white"
    : "bg-[var(--surface-sunken)] text-[var(--text-primary)]";
  const headerIdle = isBuleje
    ? "text-white/75 hover:bg-white/[0.04] hover:text-white"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";
  const itemActive = isBuleje
    ? "bg-[rgba(0,180,166,0.18)] text-[#5eead4] font-semibold"
    : "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold";
  const itemIdle = isBuleje
    ? "text-white/70 hover:bg-white/[0.04] hover:text-white"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const items = group.items.filter((it) => visibleHrefs.has(it.href));
        if (items.length === 0) return null;
        const isOpen = expanded.has(group.id);
        const panelId = `m-nav-group-${group.id}`;

        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={[
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-base font-bold transition-colors",
                isOpen ? headerActive : headerIdle,
              ].join(" ")}
            >
              <span className="shrink-0">{group.icon}</span>
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronDown
                className={[
                  "w-4 h-4 transition-transform duration-200 shrink-0",
                  isOpen ? "rotate-0" : "-rotate-90",
                ].join(" ")}
              />
            </button>
            {isOpen && (
              <div id={panelId} className="mt-1 ml-2 pl-3 border-l border-white/10 dark:border-white/10 space-y-0.5">
                {items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/superadmin/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onItemClick}
                      className={[
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        active ? itemActive : itemIdle,
                      ].join(" ")}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
