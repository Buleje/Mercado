"use client";

/**
 * AdminModuleHeader — Encabezado editorial estándar para TODOS los módulos admin.
 *
 * Actualizado 2026-04-18: pasa de header horizontal simple a layout editorial
 * coherente con "Editorial Amazónico" (eyebrow + title Fraunces italic +
 * subtitle + border-bottom).
 *
 * Jerarquía tipográfica fija:
 *   eyebrow  → Kicker uppercase tracking wide
 *   title    → PageTitle font-display italic (variable, se adapta al largo)
 *   subtitle → BodyText text-secondary, max 2 líneas
 *   icon     → opcional, 5x5 grayscale sutil (decorativo)
 *
 * Slot `children` reservado para acciones:
 *   - 1-2 botones primarios (inline)
 *   - Muchas acciones → envolver en <ModuleActionMenu items={...} />
 *
 * Uso mínimo:
 *   <AdminModuleHeader title="Productos" icon={Package}
 *     description="Catálogo de productos y stock." />
 *
 * Uso avanzado:
 *   <AdminModuleHeader
 *     eyebrow="Inventario · Catálogo"
 *     title="Productos"
 *     description="Gestioná tus ítems, precios y stock base."
 *     icon={Package}
 *   >
 *     <button className="...">Nuevo producto</button>
 *     <ModuleActionMenu items={[...]} />
 *   </AdminModuleHeader>
 */

import { PageTitle, Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "@buleje/design-system/icons";

interface AdminModuleHeaderProps {
  /** Línea pequeña arriba del título (ej: "Inventario · Catálogo"). */
  eyebrow?: string;
  /** Título principal — se renderiza con font-display italic. */
  title: string;
  /** Descripción breve (1-2 líneas, lenguaje simple). Acepta JSX para deep-links inline. */
  description?: React.ReactNode;
  /** Icono decorativo opcional. */
  icon?: LucideIcon;
  /** @deprecated — ignored, kept for backward compat */
  iconColor?: string;
  /** @deprecated — ignored, kept for backward compat */
  bgTint?: string;
  /** @deprecated — ignored, kept for backward compat */
  iconColorClass?: string;
  /** Slot para acciones: botones, dropdowns, date pickers, etc. */
  children?: React.ReactNode;
  /** Si true, omite el border-bottom (útil cuando el módulo empieza con filtros pegados). */
  noBorder?: boolean;
  className?: string;
}

export default function AdminModuleHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
  noBorder = false,
  className,
}: AdminModuleHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6 pb-4",
        !noBorder && "border-b border-[var(--rule-soft)]",
        className,
      )}
    >
      <div className="flex gap-3 min-w-0">
        {Icon && (
          <Icon
            className="hidden sm:block w-5 h-5 text-[var(--text-tertiary)] dark:text-zinc-500 shrink-0 mt-1.5"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
        <div className="min-w-0">
          {eyebrow && <Kicker className="mb-1">{eyebrow}</Kicker>}
          <PageTitle
            as="h1"
            className="font-display tracking-tight leading-[1.05]"
          >
            {title}
          </PageTitle>
          {description && (
            <p className="mt-1.5 text-sm text-[var(--text-secondary)] dark:text-zinc-400 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {children}
        </div>
      )}
    </header>
  );
}
