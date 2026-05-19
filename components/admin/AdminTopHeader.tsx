"use client";

/**
 * components/admin/AdminTopHeader.tsx
 *
 * Header sticky del panel admin (escritorio + mobile). Contiene:
 *  - Botón hamburger (mobile)
 *  - Search bar global con shortcut Ctrl+K
 *  - NotificationBell (desktop)
 *  - Botón "Cerrar día"
 *  - Toggle focus mode (desktop only)
 *  - Toggle presentation mode (desktop only)
 *  - AdminUserDropdown (avatar + menú de usuario)
 *
 * Se oculta cuando `presentationMode === true` y se desplaza 10 px hacia
 * abajo si hay impersonation banner activo.
 *
 * Extraído de app/admin/page.tsx (Paso 5 del refactor — JSX components).
 */

import { useEffect, useState } from "react";
import { Menu, Search, Store as StoreIcon, ExternalLink } from "@buleje/design-system/icons";
import Link from "next/link";
import NotificationBell from "@/components/notifications/NotificationBell";
import AdminUserDropdown from "@/components/admin/AdminUserDropdown";
import AdminOptionsDropdown from "@/components/admin/AdminOptionsDropdown";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { cn } from "@/lib/utils";

type HeaderThemingEvent = {
  applyToHeader: boolean;
  theme: "light" | "dark" | "cristal" | "shaded" | "buleje";
  accent: "teal" | "emerald" | "sky" | "violet" | "amber" | "rose";
};

function readInitialHeaderTheming(): HeaderThemingEvent {
  if (typeof window === "undefined") return { applyToHeader: false, theme: "buleje", accent: "teal" };
  try {
    const applyToHeader = localStorage.getItem("admin-sidebar-apply-to-header") === "true";
    const rawTheme = localStorage.getItem("admin-sidebar-theme");
    const theme: HeaderThemingEvent["theme"] =
      rawTheme === "cristal" || rawTheme === "dark" || rawTheme === "light" || rawTheme === "shaded" || rawTheme === "buleje"
        ? (rawTheme as HeaderThemingEvent["theme"])
        : "buleje";
    const rawAccent = localStorage.getItem("admin-sidebar-accent");
    const accent: HeaderThemingEvent["accent"] =
      rawAccent === "teal" || rawAccent === "emerald" || rawAccent === "sky" || rawAccent === "violet" || rawAccent === "amber" || rawAccent === "rose"
        ? (rawAccent as HeaderThemingEvent["accent"])
        : "teal";
    return { applyToHeader, theme, accent };
  } catch {
    return { applyToHeader: false, theme: "light", accent: "teal" };
  }
}

export interface AdminTopHeaderProps {
  presentationMode: boolean;
  isSuperAdminImpersonating: boolean;
  focusMode: boolean;
  resolvedTheme: "light" | "dark";
  themeMode: "light" | "dark" | "system";
  userName: string;
  userRole: string;
  tenantSlug?: string | null;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
  onOpenCierreDiario: () => void;
  onToggleFocus: () => void;
  onTogglePresentation: () => void;
  onToggleTheme: () => void;
  onSetTheme: (t: "light" | "dark" | "system") => void;
  onNavigate: (tab: string) => void;
  onLogout: () => void | Promise<void>;
}

export function AdminTopHeader({
  presentationMode,
  isSuperAdminImpersonating,
  focusMode,
  resolvedTheme,
  themeMode,
  userName,
  userRole,
  tenantSlug,
  tenantName,
  tenantLogoUrl,
  onOpenMobileNav,
  onOpenSearch,
  onOpenCierreDiario,
  onToggleFocus,
  onTogglePresentation,
  onToggleTheme,
  onSetTheme,
  onNavigate,
  onLogout,
}: AdminTopHeaderProps) {
  // Theming reactivo desde el sidebar
  const [theming, setTheming] = useState<HeaderThemingEvent>(readInitialHeaderTheming);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<HeaderThemingEvent>).detail;
      if (detail) setTheming(detail);
    };
    window.addEventListener("admin-sidebar-theming-change", handler);
    return () => window.removeEventListener("admin-sidebar-theming-change", handler);
  }, []);

  /* Clases del header según si aplica tema del sidebar o no.
     IMPORTANTE: cuando el tema es "buleje" (marca completa) o "dark"
     (preset "ejecutivo"), aplica automáticamente al header sin importar
     applyToHeader — son temas oscuros integrales y se ven desconectados
     si el header queda claro.

     Brandon 2026-05-16: ejecutivo ahora pinta el nav superior con
     gradient negro-zinc + border tintado por el accent amber, para que
     se vea más elegante y coherente con el sidebar. */
  const isBulejeTheme = theming.theme === "buleje" || theming.theme === "cristal" || theming.theme === "shaded";
  const isEjecutivoTheme = theming.theme === "dark";
  const isAutoDarkTheme = isBulejeTheme || isEjecutivoTheme;
  const headerThemeClasses = (theming.applyToHeader || isAutoDarkTheme)
    ? isBulejeTheme
      ? "bg-[linear-gradient(180deg,#0b1f2b_0%,#0a1922_100%)] border-[color-mix(in_oklab,var(--accent)_30%,transparent)] text-white/80"
      : isEjecutivoTheme
        ? "bg-[linear-gradient(180deg,#09090b_0%,#18181b_100%)] border-[color-mix(in_oklab,var(--accent)_25%,transparent)] text-zinc-300"
        : "bg-white dark:bg-[var(--color-card)] border-[var(--rule-base)] text-[var(--text-primary)]"
    : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)]";

  return (
    <header
      className={cn(
        "border-b px-4 sm:px-6 py-2 flex items-center justify-between gap-2 sticky top-0 z-40 transition-colors duration-[var(--dur-base)]",
        headerThemeClasses,
        presentationMode && "hidden!"
      )}
    >
      {/* Left: hamburger (mobile) + search */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <AdminTooltip content="Abrir menú" side="bottom">
          <button
            onClick={onOpenMobileNav}
            className="sm:hidden inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors shrink-0"
            aria-label="Menú"
          >
            <Menu className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
          </button>
        </AdminTooltip>

        <button
          onClick={onOpenSearch}
          aria-label="Búsqueda global (atajo Ctrl+K)"
          className={cn(
            "group flex items-center gap-2.5 px-3.5 h-11 sm:h-10 rounded-xl flex-1 max-w-xl cursor-pointer transition-all border",
            isAutoDarkTheme
              ? "bg-white/[0.04] border-[color-mix(in oklab, var(--accent) 15%, transparent)] hover:border-[color-mix(in oklab, var(--accent) 40%, transparent)] hover:bg-white/[0.07]"
              : "bg-[var(--surface-sunken)] dark:bg-surface border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:bg-white dark:hover:bg-[var(--surface-raised)] hover:shadow-[var(--shadow-sm)]"
          )}
        >
          <Search className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isAutoDarkTheme ? "text-white/50 group-hover:text-[color-mix(in oklab, var(--accent) 60%, white)]" : "text-[var(--text-tertiary)] dark:text-muted group-hover:text-primary"
          )} strokeWidth={2} />
          <span className={cn(
            "flex-1 text-left text-sm font-medium truncate transition-colors",
            isAutoDarkTheme ? "text-white/55 group-hover:text-white/80" : "text-[var(--text-tertiary)] dark:text-muted group-hover:text-[var(--text-secondary)]"
          )}>
            Buscar módulos, productos, clientes...
          </span>
          <kbd className={cn(
            "hidden sm:inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold font-mono px-1.5 py-0.5 rounded-md tabular-nums border",
            isAutoDarkTheme
              ? "text-white/55 bg-white/[0.06] border-white/[0.1]"
              : "text-[var(--text-tertiary)] dark:text-muted bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)]"
          )}>
            <span className="text-base leading-none">⌘</span>K
          </kbd>
        </button>

        {/* Chip de tenant activo — reemplaza la barra superior gruesa.
            Dark mode: usa bg-white/5 + border-white/20 para contraste.
            Texto en claro (primary) en light, en claro (gray-100) en dark. */}
        {tenantSlug && (
          <Link
            href={`/t/${tenantSlug}/tienda`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir tienda en nueva pestaña"
            className={cn(
              "hidden md:inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border text-xs font-semibold transition-colors shrink-0",
              isAutoDarkTheme
                ? "border-[color-mix(in oklab, var(--accent) 30%, transparent)] bg-[color-mix(in oklab, var(--accent) 10%, transparent)] text-[color-mix(in oklab, var(--accent) 60%, white)] hover:bg-[color-mix(in oklab, var(--accent) 18%, transparent)]"
                : "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 dark:border-white/20 dark:bg-white/[0.06] dark:text-gray-100 dark:hover:bg-white/[0.1]"
            )}
          >
            {tenantLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={tenantLogoUrl}
                alt=""
                className="h-5 w-5 rounded-md object-cover bg-white/30 shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <StoreIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            )}
            <span className="truncate max-w-[120px]">{tenantName || tenantSlug}</span>
            <ExternalLink className="h-3 w-3 opacity-70" strokeWidth={1.75} aria-hidden />
          </Link>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="hidden sm:block">
          <NotificationBell />
        </div>

        <AdminOptionsDropdown
          focusMode={focusMode}
          resolvedTheme={resolvedTheme}
          themeMode={themeMode}
          onOpenCierreDiario={onOpenCierreDiario}
          onToggleFocus={onToggleFocus}
          onTogglePresentation={onTogglePresentation}
          onSetTheme={onSetTheme}
        />

        <AdminUserDropdown
          userName={userName}
          userRole={userRole}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}
