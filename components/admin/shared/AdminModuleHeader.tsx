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
    // `@container`: el header se mide contra SU ancho real, no contra el
    // viewport. Con el sidebar abierto, una ventana de 991px deja ~700px de
    // contenido — un `sm:flex-row` (viewport ≥640) ponía título y acciones en
    // fila igual, y como las acciones no cedían ancho el título quedaba con
    // 15px: la descripción se partía en 12 líneas de una palabra.
    //
    // Los breakpoints van en REM EXPLÍCITOS (`@min-[48rem]`) y no en `@sm/@md`:
    // este proyecto redefine `--container-*` en @theme (sm=720px, md=960px) y
    // ni siquiera existen `--container-2xl/3xl`, así que las variantes con
    // nombre valdrían otra cosa —o nada— sin avisar.
    <header
      className={cn(
        "@container mb-6 pb-4",
        !noBorder && "border-b border-[var(--rule-soft)]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 @min-[48rem]:flex-row @min-[48rem]:items-end @min-[48rem]:justify-between">
        <div className="flex gap-3 min-w-0">
          {Icon && (
            <Icon
              // Antes hidden sm:block — en mobile el header perdia ancla
              // visual. Ahora se muestra desde mobile, un poco mas chico.
              className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--text-tertiary)] dark:text-zinc-500 shrink-0 mt-1 sm:mt-1.5"
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
            {/* En angosto la descripción se oculta (Brandon 2026-07-22): en una
                pantalla chica lo que importa es el título y las acciones, no el
                subtítulo explicativo.
                Con `hidden`, no con `sr-only` + `not-sr-only`: la utilidad
                `sr-only` gana por orden en el CSS generado y el texto quedaba
                oculto SIEMPRE, también en escritorio (verificado en navegador). */}
            {description && (
              <p className="hidden @min-[32rem]:block mt-1.5 text-sm text-[var(--text-secondary)] dark:text-zinc-400 max-w-2xl leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
        {children && (
          // Sin `shrink-0`: cuando entran en la misma fila no deben aplastar al
          // título; cuando no entran, bajan y se envuelven entre ellas.
          <div className="flex flex-wrap items-center gap-2 @min-[48rem]:justify-end">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}
