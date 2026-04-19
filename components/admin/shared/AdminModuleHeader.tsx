"use client";
import { SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "@buleje/design-system/icons";

/* ═══════════════════════════════════════════════════════════════════════════
 * AdminModuleHeader — Encabezado estándar para TODOS los módulos admin.
 *
 * Tipografía fija (NO cambiar sin actualizar todos los módulos):
 *   - Título (h1): text-xl / font-bold / text-[var(--text-primary)]
 *   - Subtítulo: text-sm / text-[var(--text-secondary)]
 *   - Icono: 44×44 rounded-xl, fondo tint por categoría
 *
 * Props de color (tint por categoría):
 *   - bgTint: clase Tailwind del fondo del icono (e.g. "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]")
 *   - iconColorClass: clase Tailwind del color del icono (e.g. "text-[var(--data-success)] dark:text-[var(--data-success)]")
 * ═══════════════════════════════════════════════════════════════════════════ */

interface AdminModuleHeaderProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  /** @deprecated — usar bgTint + iconColorClass en su lugar */
  iconColor?: string;
  /** Clase Tailwind para el fondo del contenedor del icono */
  bgTint?: string;
  /** Clase Tailwind para el color del icono */
  iconColorClass?: string;
  children?: React.ReactNode;
  className?: string;
}

export default function AdminModuleHeader({
  title,
  description,
  icon: Icon,
  // Kept for backward compatibility — props accepted but no longer rendered
  iconColor: _iconColor,
  bgTint: _bgTint,
  iconColorClass: _iconColorClass,
  children,
  className,
}: AdminModuleHeaderProps) {
  return (
    <div className={cn("flex items-center gap-4 mb-6", className)}>
      <Icon className="w-6 h-6 text-[var(--text-tertiary)] dark:text-zinc-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <SectionTitle as="h1" className="text-xl truncate">
          {title}
        </SectionTitle>
        {description && (
          <p className="text-sm text-[var(--text-secondary)] dark:text-zinc-400 mt-0.5 truncate">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
