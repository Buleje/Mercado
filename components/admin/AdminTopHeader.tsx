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
import AdminMensajesMenu from "@/components/admin/AdminMensajesMenu";
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
        // Brandon 2026-05-28: en MOBILE forzamos fondo CLARO (surface-raised)
        // y texto primary — los temas "Buleje" / "Ejecutivo" dejaban el header
        // negro con `background-image: linear-gradient(...)` que se veía pesado
        // en cel. Anulamos también el bg-image (bg-none) para que no quede el
        // gradient encima. En sm+ se respeta el theme configurado.
        "max-sm:bg-[var(--surface-raised)]! max-sm:bg-none! max-sm:text-[var(--text-primary)]! max-sm:border-[var(--rule-base)]!",
        "@container border-b px-4 sm:px-6 py-2 flex items-center justify-between gap-2 sticky top-0 z-40 transition-colors duration-[var(--dur-base)]",
        headerThemeClasses,
        presentationMode && "hidden!"
      )}
    >
      {/* Left: hamburger (mobile) + search */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <AdminTooltip content="Abrir menú" side="bottom">
          <button
            onClick={onOpenMobileNav}
            // Brandon 2026-05-28: estilo branded — círculo teal-soft con icono
            // accent (mismo lenguaje visual que el resto del DS de Buleje).
            className={cn(
              "sm:hidden inline-flex items-center justify-center h-11 w-11 rounded-xl transition-colors shrink-0 ring-1",
              "bg-[var(--accent-soft)] text-[var(--accent)] ring-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
              "hover:bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface-raised))]"
            )}
            aria-label="Menú"
          >
            <Menu className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </AdminTooltip>

        <button
          onClick={onOpenSearch}
          aria-label="Búsqueda global (atajo Ctrl+K)"
          className={cn(
            // Brandon 2026-05-28: en MOBILE = botón lupa cuadrado branded
            // (teal-soft + accent), igual que la hamburguesa. En sm+ vuelve a
            // ser el pill ancho con placeholder y atajo ⌘K (theme-aware).
            "group inline-flex sm:flex items-center justify-center sm:justify-start h-11 w-11 sm:w-auto sm:flex-1 sm:max-w-xl sm:h-10 sm:px-3.5 sm:gap-2.5 rounded-xl cursor-pointer transition-all shrink-0 sm:shrink sm:min-w-11",
            "max-sm:bg-[var(--accent-soft)]! max-sm:text-[var(--accent)]! max-sm:ring-1 max-sm:ring-[color-mix(in_oklab,var(--accent)_18%,transparent)]! max-sm:border-0!",
            "sm:border",
            isAutoDarkTheme
              ? "sm:bg-white/[0.04] sm:border-[color-mix(in oklab, var(--accent) 15%, transparent)] sm:hover:border-[color-mix(in oklab, var(--accent) 40%, transparent)] sm:hover:bg-white/[0.07]"
              : "sm:bg-[var(--surface-sunken)] sm:dark:bg-surface sm:border-[var(--rule-base)] sm:dark:border-[var(--rule-base)] sm:hover:border-primary/40 sm:hover:bg-white sm:dark:hover:bg-[var(--surface-raised)] sm:hover:shadow-[var(--shadow-sm)]"
          )}
        >
          <Search className={cn(
            "h-5 w-5 sm:h-4 sm:w-4 shrink-0 transition-colors",
            "max-sm:text-[var(--accent)]!",
            isAutoDarkTheme ? "sm:text-white/50 sm:group-hover:text-[color-mix(in oklab, var(--accent) 60%, white)]" : "sm:text-[var(--text-tertiary)] sm:dark:text-muted sm:group-hover:text-primary"
          )} strokeWidth={2.25} />
          <span className={cn(
            "hidden sm:block flex-1 text-left text-sm font-medium truncate transition-colors",
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

      </div>

      {/* Right: actions */}
      <div className="flex min-w-0 items-center gap-1">
        {/* Ver mi tienda — CTA explícito que abre el storefront público en pestaña
            nueva (Brandon 2026-06-07). El dueño salta de administrar a ver lo que
            ve el cliente. Siempre visible (ícono en mobile, +label en sm+). */}
        {tenantSlug && (
          <Link
            href={`/t/${tenantSlug}/tienda`}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver mi tienda (abre en pestaña nueva)"
            // Brandon 2026-06-14: botón branded theme-aware. Antes era
            // text-[var(--text-primary)] fijo → en header oscuro (buleje/ejecutivo)
            // quedaba texto oscuro sobre oscuro (ilegible). Ahora chip de acento
            // con buen contraste en claro y oscuro.
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-bold transition-colors sm:px-3",
              isAutoDarkTheme
                ? "border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-[color-mix(in_oklab,var(--accent)_65%,white)] hover:bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]"
                : "border-[color-mix(in_oklab,var(--accent)_25%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface-raised))]"
            )}
          >
            <StoreIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
            <span className="hidden @min-[56rem]:inline">Ver mi tienda</span>
            <ExternalLink className="h-3 w-3 opacity-70" strokeWidth={1.75} aria-hidden />
          </Link>
        )}
        {/* Chat con clientes + mensajes de la plataforma en UN botón con el
            total sin leer. Eran dos íconos sueltos con badges que competían
            entre sí y llenaban la barra (ADR-132 + Messenger 2026-06-06). */}
        <AdminMensajesMenu />
        <div className="hidden @min-[44rem]:block">
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
