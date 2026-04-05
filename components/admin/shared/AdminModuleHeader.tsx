"use client";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
 * AdminModuleHeader — Encabezado estándar para TODOS los módulos admin.
 *
 * Tipografía fija (NO cambiar sin actualizar todos los módulos):
 *   - Título (h1): text-xl / font-bold / text-gray-900
 *   - Descripción: text-xs / text-gray-500
 *   - Icono: 40×40 rounded-xl, fondo teal (#00B4A6)
 * ═══════════════════════════════════════════════════════════════════════════ */

interface AdminModuleHeaderProps {
  title: string;
  description?: string;
  icon: LucideIcon;
  iconColor?: string;
  children?: React.ReactNode;
  className?: string;
}

export default function AdminModuleHeader({
  title,
  description,
  icon: Icon,
  iconColor = "#00B4A6",
  children,
  className,
}: AdminModuleHeaderProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 bg-white/95 backdrop-blur-sm pb-3 -mx-1 px-1",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-10 w-10 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0"
            style={{ backgroundColor: iconColor }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {title}
            </h1>
            {description && (
              <p className="text-xs text-gray-500 truncate">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex items-center gap-2 shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
