"use client";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
 * AdminModuleHeader — Encabezado estándar para TODOS los módulos admin.
 *
 * Tipografía fija (NO cambiar sin actualizar todos los módulos):
 *   - Título (h1): text-xl / font-bold / text-gray-900
 *   - Subtítulo: text-sm / text-gray-500
 *   - Icono: 44×44 rounded-xl, fondo tint por categoría
 *
 * Props de color (tint por categoría):
 *   - bgTint: clase Tailwind del fondo del icono (e.g. "bg-emerald-50 dark:bg-emerald-900/20")
 *   - iconColorClass: clase Tailwind del color del icono (e.g. "text-emerald-600 dark:text-emerald-400")
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
      <Icon className="w-6 h-6 text-gray-400 dark:text-zinc-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5 truncate">
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
