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

import { Menu, Search, Store as StoreIcon, ExternalLink } from "@buleje/design-system/icons";
import Link from "next/link";
import NotificationBell from "@/components/notifications/NotificationBell";
import AdminUserDropdown from "@/components/admin/AdminUserDropdown";
import AdminOptionsDropdown from "@/components/admin/AdminOptionsDropdown";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { cn } from "@/lib/utils";

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
  return (
    <header
      className={cn(
        "bg-white dark:bg-card border-b border-[var(--rule-base)] dark:border-card-border px-4 sm:px-6 py-2 flex items-center justify-between gap-2 sticky top-0 z-40",
        presentationMode && "hidden!"
      )}
    >
      {/* Left: hamburger (mobile) + search */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <AdminTooltip content="Abrir menú" side="bottom">
          <button
            onClick={onOpenMobileNav}
            className="sm:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors shrink-0"
            aria-label="Menú"
          >
            <Menu className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
          </button>
        </AdminTooltip>

        <button
          onClick={onOpenSearch}
          aria-label="Búsqueda global (atajo Ctrl+K)"
          className="flex items-center gap-2.5 px-4 h-10 rounded-xl text-[var(--text-tertiary)] dark:text-muted bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-all text-sm font-medium border border-[var(--rule-base)] dark:border-card-border flex-1 max-w-xl group cursor-pointer"
        >
          <Search className="h-4.5 w-4.5 shrink-0 group-hover:text-primary transition-colors" />
          <span className="flex-1 text-left text-[var(--text-tertiary)] dark:text-muted truncate">
            Buscar módulos, productos, clientes...
          </span>
          <kbd className="text-[length:var(--ts-2xs)] bg-white dark:bg-card px-2 py-0.5 rounded-lg font-mono text-[var(--text-tertiary)] border border-[var(--rule-base)] dark:border-card-border hidden sm:inline">
            ⌘K
          </kbd>
        </button>

        {/* Chip de tenant activo — reemplaza la barra superior gruesa.
            Muestra el nombre del negocio administrado + link rapido a tienda. */}
        {tenantSlug && (
          <Link
            href={`/t/${tenantSlug}/tienda`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir tienda en nueva pestaña"
            className="hidden md:inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/20 text-xs font-semibold text-primary transition-colors shrink-0"
          >
            <StoreIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
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
