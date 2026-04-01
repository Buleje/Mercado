"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href: string;
}

interface SuperAdminShellProps {
  children: React.ReactNode;
  username: string;
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",   icon: <LayoutDashboard className="w-5 h-5 shrink-0" />, href: "/superadmin/dashboard" },
  { label: "Tiendas",     icon: <Building2       className="w-5 h-5 shrink-0" />, href: "/superadmin/tenants"   },
  { label: "Marketplace", icon: <ShoppingBag     className="w-5 h-5 shrink-0" />, href: "/superadmin/stores"    },
  { label: "Analytics",   icon: <BarChart3       className="w-5 h-5 shrink-0" />, href: "/superadmin/analytics" },
  { label: "Actividad",   icon: <Activity        className="w-5 h-5 shrink-0" />, href: "/superadmin/activity"  },
  { label: "Config",      icon: <Settings        className="w-5 h-5 shrink-0" />, href: "/superadmin/settings"  },
];

const PAGE_TITLES: Record<string, string> = {
  "/superadmin/dashboard": "Dashboard",
  "/superadmin/tenants":   "Tiendas",
  "/superadmin/stores":    "Marketplace",
  "/superadmin/analytics": "Analytics",
  "/superadmin/activity":  "Actividad",
  "/superadmin/settings":  "Config",
  "/superadmin":           "Dashboard",
};

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
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white text-xs font-semibold flex items-center justify-center gap-3 py-2 px-4">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      Estás viendo como:{" "}
      <span className="font-mono bg-white/20 px-1.5 py-0.5 rounded">{slug}</span>
      <button type="button" onClick={onClear} className="ml-2 underline hover:no-underline">
        Salir
      </button>
    </div>
  );
}

// ─── Main Shell ───────────────────────────────────────────────────────────────

export default function SuperAdminShell({ children, username }: SuperAdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggle } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Check for impersonation on mount
  useEffect(() => {
    const slug = localStorage.getItem("impersonating-tenant");
    if (slug) setImpersonating(slug);
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
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
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
          "bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800",
          "transition-all duration-200",
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
            "flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-800 shrink-0",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-sm font-bold text-gray-900 dark:text-white leading-none">
                Buleje
              </div>
              <div className="text-[10px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-widest mt-0.5">
                Platform
              </div>
            </div>
          )}
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
                  collapsed ? "justify-center" : "",
                  active
                    ? "bg-teal-600/20 text-teal-600 dark:text-teal-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
                ].join(" ")}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
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
              "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-gray-400 dark:text-gray-500",
              "hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
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
            "bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800",
            impersonating ? "pt-8" : "",
          ].join(" ")}
        >
          {/* Logo */}
          <div className="flex items-center justify-between px-4 py-5 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900 dark:text-white leading-none">
                  Buleje
                </div>
                <div className="text-[10px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-widest mt-0.5">
                  Platform
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
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
                      ? "bg-teal-600/20 text-teal-600 dark:text-teal-400"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
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
          "flex-1 flex flex-col min-w-0 transition-all duration-200",
          // Offset for sidebar on desktop
          collapsed ? "md:ml-16" : "md:ml-60",
          impersonating ? "pt-8" : "",
        ].join(" ")}
      >
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-center justify-between px-4 sm:px-6 h-14 gap-4">
            {/* Left: hamburger (mobile) + page title */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                {pageTitle}
              </h1>
            </div>

            {/* Right: username + theme toggle + logout */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Username badge */}
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span className="truncate max-w-[120px]">{username}</span>
              </div>

              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggle}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={dark ? "Modo claro" : "Modo oscuro"}
              >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
