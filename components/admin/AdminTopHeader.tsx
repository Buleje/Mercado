"use client";

/**
 * components/admin/AdminTopHeader.tsx
 *
 * Header sticky del panel admin (escritorio + mobile). Contiene:
 *  - Botón hamburger (mobile)
 *  - Buscador EN LÍNEA (`GlobalSearch`: resultados debajo del campo, Ctrl+K lo enfoca)
 *  - Cámaras + «Accesos directos» (abren su módulo en un modal; adentro, «Recientes»)
 *  - NotificationBell (todos los anchos; abre el centro como modal central)
 *  - Botón "Cerrar día"
 *  - Toggle focus mode (desktop only)
 *  - Toggle presentation mode (desktop only)
 *  - AdminUserDropdown (avatar + menú de usuario)
 *
 * Se oculta cuando `presentationMode === true` y se pega 56 px más abajo
 * (`top-14`) si está la franja de la vista de tienda del superadmin.
 *
 * Extraído de app/admin/page.tsx (Paso 5 del refactor — JSX components).
 */

import { memo, useEffect, useState } from "react";
import { Menu, Store as StoreIcon, ExternalLink } from "@buleje/design-system/icons";
import Link from "next/link";
import NotificationBell from "@/components/notifications/NotificationBell";
import AdminMensajesMenu from "@/components/admin/AdminMensajesMenu";
import AdminUserDropdown from "@/components/admin/AdminUserDropdown";
import AdminOptionsDropdown from "@/components/admin/AdminOptionsDropdown";
import GlobalSearch from "@/components/admin/GlobalSearch";
import AccesosRapidos from "@/components/admin/header/AccesosRapidos";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { useRegistrarRecientes } from "@/hooks/use-recientes-panel";
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
  /** @deprecated 20-10: el buscador es el campo de la cabecera; Ctrl+K lo enfoca solo. */
  onOpenSearch?: () => void;
  onOpenCierreDiario: () => void;
  onToggleFocus: () => void;
  onTogglePresentation: () => void;
  onToggleTheme: () => void;
  onSetTheme: (t: "light" | "dark" | "system") => void;
  onNavigate: (tab: string) => void;
  onLogout: () => void | Promise<void>;
}

// Memoizado — es chrome siempre visible (header sticky); mismo motivo que
// AdminSidebar. Sólo sirve si AdminPage le pasa callbacks estables.
export const AdminTopHeader = memo(function AdminTopHeader({
  presentationMode,
  isSuperAdminImpersonating,
  focusMode,
  resolvedTheme,
  themeMode,
  userName,
  userRole,
  tenantSlug,
  onOpenMobileNav,
  onOpenCierreDiario,
  onToggleFocus,
  onTogglePresentation,
  onSetTheme,
  onNavigate,
  onLogout,
}: AdminTopHeaderProps) {
  /* Anota cada lugar que abres para «Recientes» (menú de accesos directos). */
  useRegistrarRecientes();

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
        : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-primary)]"
    : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)]";

  return (
    <header
      // Marca de anclaje del header (la buscan otras piezas para medir su borde).
      data-admin-header=""
      className={cn(
        // Brandon 2026-05-28: en MOBILE forzamos fondo CLARO (surface-raised)
        // y texto primary — los temas "Buleje" / "Ejecutivo" dejaban el header
        // negro con `background-image: linear-gradient(...)` que se veía pesado
        // en cel. Anulamos también el bg-image (bg-none) para que no quede el
        // gradient encima. En sm+ se respeta el theme configurado.
        "max-sm:bg-[var(--surface-raised)]! max-sm:bg-none! max-sm:text-[var(--text-primary)]! max-sm:border-[var(--rule-base)]!",
        "@container border-b px-4 sm:px-6 py-2 flex items-center justify-between gap-2 sticky top-0 z-40 transition-colors duration-[var(--dur-base)]",
        headerThemeClasses,
        // Franja de la vista de tienda (AdminImpersonationBanner, h-14) arriba: el
        // header se pega debajo de ella para que las dos queden fijas al bajar.
        isSuperAdminImpersonating && "top-14",
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
              "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] ring-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
              "hover:bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface-raised))]"
            )}
            aria-label="Menú"
          >
            <Menu className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </AdminTooltip>

        {/* Brandon 20-10: el campo busca ahí mismo, sin ventana. En celular es
            una lupa que despliega el campo sobre esta misma cabecera.
            El ancho va en un token propio (`--panel-search-max`, 30 → 36/44 rem
            en monitores grandes): `sm:max-w-xl` valía 1440 px acá. */}
        <GlobalSearch />

        {/* Brandon 2026-10-10: «accesos directos al lado de Buscar módulos».
            20-10: a la vista sólo Cámaras y el botón; «Recientes» va en su menú. */}
        <AccesosRapidos onDarkHeader={isAutoDarkTheme} />
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
                : "border-[color-mix(in_oklab,var(--accent)_25%,transparent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface-raised))]"
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
        <AdminMensajesMenu onDarkHeader={isAutoDarkTheme} />
        {/* En todos los anchos (10-10): escondida bajo 44 rem, en el celular
            no había por dónde llegar a las notificaciones. */}
        <NotificationBell onDarkHeader={isAutoDarkTheme} />

        <AdminOptionsDropdown
          focusMode={focusMode}
          resolvedTheme={resolvedTheme}
          themeMode={themeMode}
          onOpenCierreDiario={onOpenCierreDiario}
          onToggleFocus={onToggleFocus}
          onTogglePresentation={onTogglePresentation}
          onSetTheme={onSetTheme}
          onDarkHeader={isAutoDarkTheme}
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
});
