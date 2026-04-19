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

import { Eye, Maximize2, Menu, Minimize2, Power, Search } from "@buleje/design-system/icons";
import NotificationBell from "@/components/notifications/NotificationBell";
import AdminUserDropdown from "@/components/admin/AdminUserDropdown";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { cn } from "@/lib/utils";

export interface AdminTopHeaderProps {
  presentationMode: boolean;
  isSuperAdminImpersonating: boolean;
  focusMode: boolean;
  userName: string;
  userRole: string;
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
  onOpenCierreDiario: () => void;
  onToggleFocus: () => void;
  onTogglePresentation: () => void;
  onNavigate: (tab: string) => void;
  onLogout: () => void | Promise<void>;
}

export function AdminTopHeader({
  presentationMode,
  isSuperAdminImpersonating,
  focusMode,
  userName,
  userRole,
  onOpenMobileNav,
  onOpenSearch,
  onOpenCierreDiario,
  onToggleFocus,
  onTogglePresentation,
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
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="hidden sm:block">
          <NotificationBell />
        </div>

        <AdminTooltip content="Cerrar el día y arquear caja · Ctrl+Shift+C" side="bottom">
          <button
            onClick={onOpenCierreDiario}
            aria-label="Cerrar día"
            className="hidden md:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--data-warning)] dark:text-[var(--data-warning)] hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/30 transition-colors border border-[var(--data-warning)] dark:border-[var(--data-warning)]"
          >
            <Power className="h-4 w-4" />
            <span>Cerrar día</span>
          </button>
        </AdminTooltip>

        <AdminTooltip
          content={focusMode ? "Salir del modo enfoque" : "Ocultar sidebar para enfocarte"}
          side="bottom"
        >
          <button
            onClick={onToggleFocus}
            aria-label={focusMode ? "Salir modo enfoque" : "Activar modo enfoque"}
            aria-pressed={focusMode}
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            {focusMode ? (
              <Minimize2 className="h-4 w-4 text-primary" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </AdminTooltip>

        <AdminTooltip content="Modo presentación (pantalla limpia) · Ctrl+Shift+P" side="bottom">
          <button
            onClick={onTogglePresentation}
            aria-label="Activar modo presentación"
            className="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary transition-colors"
          >
            <Eye className="h-4 w-4" />
          </button>
        </AdminTooltip>

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
