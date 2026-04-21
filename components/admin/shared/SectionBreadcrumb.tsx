"use client";
/**
 * SectionBreadcrumb — Breadcrumb editorial que muestra el contexto de
 * seccion del modulo activo dentro del admin.
 *
 * Pattern usado consistentemente desde commit 68da6ab1 en:
 *   - POSView, TurnosModule, CashRegisterTab, CashAuditTab,
 *     CommissionCalculator, FiadosModule
 *
 * En vez de duplicar el markup 6+ veces, centralizamos aqui.
 *
 * Uso:
 *   <SectionBreadcrumb icon={HandCoins} section="Ventas" page="Fiados" />
 *   <SectionBreadcrumb icon={Package} section="Inventario" page="Productos" />
 */

import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface SectionBreadcrumbProps {
  /** Icono Lucide del lado izquierdo (representa la seccion). */
  icon: LucideIcon;
  /** Nombre de la seccion padre (ej. "Ventas", "Inventario", "Clientes"). */
  section: string;
  /** Nombre del modulo/pagina actual (ej. "Fiados", "Productos"). */
  page: string;
  className?: string;
}

export function SectionBreadcrumb({ icon: Icon, section, page, className }: SectionBreadcrumbProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]",
        className,
      )}
      role="navigation"
      aria-label={`Seccion ${section}, pagina ${page}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
      <span>{section}</span>
      <span className="text-[var(--text-tertiary)]/60" aria-hidden>
        ·
      </span>
      <span className="text-[var(--text-secondary)]">{page}</span>
    </div>
  );
}

export default SectionBreadcrumb;
