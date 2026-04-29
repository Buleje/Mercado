"use client";

import { useState, useEffect } from "react";
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
  AlertTriangle,
  Clock,
  Gauge,
  HeartPulse,
  Wrench,
  FileCheck,
  ImageIcon,
  Sparkles,
} from "@buleje/design-system/icons";
import { BulejeMark } from "@/components/ui-system/illustrations";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
}

interface SuperAdminShellProps {
  children: React.ReactNode;
  username: string;
  freshToken?: string | null;
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",       icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, href: "/superadmin/dashboard"       },
  { label: "Centro Control",  icon: <Gauge           className="w-5 h-5 shrink-0" />, href: "/superadmin/control-center" },
  { label: "Tiendas",         icon: <Building2       className="w-5 h-5 shrink-0" />, href: "/superadmin/tenants"         },
  { label: "Aplicaciones",    icon: <FileCheck       className="w-5 h-5 shrink-0" />, href: "/superadmin/vendor-applications" },
  { label: "Marketplace",     icon: <ShoppingBag     className="w-5 h-5 shrink-0" />, href: "/superadmin/marketplace"     },
  { label: "Marca",           icon: <Sparkles        className="w-5 h-5 shrink-0" />, href: "/superadmin/marca"           },
  { label: "Banners",         icon: <ImageIcon       className="w-5 h-5 shrink-0" />, href: "/superadmin/banners"         },
  { label: "Analytics",       icon: <BarChart3       className="w-5 h-5 shrink-0" />, href: "/superadmin/analytics"       },
  { label: "Salud",           icon: <HeartPulse      className="w-5 h-5 shrink-0" />, href: "/superadmin/health"          },
  { label: "Actividad",       icon: <Activity        className="w-5 h-5 shrink-0" />, href: "/superadmin/activity"        },
  { label: "Seguridad",       icon: <ShieldCheck     className="w-5 h-5 shrink-0" />, href: "/superadmin/security"        },
  { label: "Config",          icon: <Settings        className="w-5 h-5 shrink-0" />, href: "/superadmin/settings"        },
];

const PAGE_TITLES: Record<string, string> = {
  "/superadmin/dashboard":       "Dashboard",
  "/superadmin/control-center":  "Centro de Control",
  "/superadmin/tenants":         "Tiendas",
  "/superadmin/vendor-applications": "Aplicaciones de vendedores",
  "/superadmin/marketplace":     "Marketplace",
  "/superadmin/marketplace/suppliers": "Marketplace · Proveedores",
  "/superadmin/marketplace/category-images": "Marketplace · Imágenes de categorías",
  "/superadmin/stores":          "Tiendas publicadas",
  "/superadmin/marca":           "Marca de la plataforma",
  "/superadmin/banners":         "Banners promocionales",
  "/superadmin/analytics":       "Analytics",
  "/superadmin/health":          "Salud del Sistema",
  "/superadmin/activity":        "Actividad",
  "/superadmin/settings":        "Config",
  "/superadmin":                 "Dashboard",
};

const STORAGE_KEY_HIDDEN = "superadmin-nav-hidden";
const STORAGE_KEY_ORDER = "superadmin-nav-order";
const STORAGE_KEY_THEME = "superadmin-nav-theme";
const STORAGE_KEY_ACCENT = "superadmin-nav-accent";
const STORAGE_KEY_DENSITY = "superadmin-nav-density";
const STORAGE_KEY_ICON_STYLE = "superadmin-nav-icon-style";

type SidebarVisualPrefs = {
  theme: "light" | "dark" | "cristal" | "shaded";
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
  const sidebarBgClass =
    visual.theme === "dark"
      ? "bg-zinc-900 border-r border-zinc-800 text-zinc-100"
      : visual.theme === "shaded"
        ? "bg-linear-to-b from-[var(--surface-canvas)] to-[var(--surface-sunken)] border-r border-[var(--rule-base)]"
        : visual.theme === "cristal"
          ? "bg-[var(--surface-canvas)]/85 backdrop-blur-md border-r border-[var(--rule-base)]"
          : "bg-[var(--surface-canvas)] border-r border-[var(--rule-base)]";
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
            "flex items-center gap-3 px-4 py-5 border-b border-[var(--rule-base)] shrink-0",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
            <BulejeMark size={20} strokeWidth={1.75} />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-sm font-bold text-[var(--text-primary)] leading-none">
                Buleje
              </div>
              <div className="text-[length:var(--ts-2xs)] font-medium text-[var(--accent)] uppercase tracking-widest mt-0.5">
                Platform
              </div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/superadmin/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={[
                  "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                  navItemPadding,
                  collapsed ? "justify-center" : "",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                ].join(" ")}
                title={collapsed ? item.label : undefined}
              >
                <span className={iconClassName}>{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="shrink-0 px-2 pb-4 hidden md:block">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={[
              "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-[var(--text-tertiary)]",
              "hover:bg-[var(--surface-sunken)] transition-colors",
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
            "bg-[var(--surface-canvas)] border-r border-[var(--rule-base)]",
            impersonating ? "pt-8" : "",
          ].join(" ")}
        >
          {/* Logo */}
          <div className="flex items-center justify-between px-4 py-5 border-b border-[var(--rule-base)] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
                <BulejeMark size={20} strokeWidth={1.75} />
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)] leading-none">
                  Buleje
                </div>
                <div className="text-[length:var(--ts-2xs)] font-medium text-[var(--accent)] uppercase tracking-widest mt-0.5">
                  Platform
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/superadmin/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={[
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
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
