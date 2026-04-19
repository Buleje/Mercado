"use client";

/**
 * MarketplaceSection — wrapper canónico para secciones del marketplace home.
 *
 * Garantiza que TODAS las secciones del home usen el mismo max-width,
 * padding horizontal y vertical, y estructura de header (title + actions).
 *
 * Tokens canonicos:
 *   max-width : max-w-7xl (1280px)
 *   px        : px-4 sm:px-6 lg:px-8
 *   py        : py-8
 *   gap cards : gap-4 (grid) / gap-3 (carrusel)
 *   grid std  : grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4
 *
 * Nota sobre OfertasDelDiaHero / ParaVosSection: esas secciones tienen
 * diseño editorial propio (hero 2-col, carrusel horizontal multi-row)
 * y aplican el wrapper solo para outer container — su inner layout queda intacto.
 */

import { cn } from "@/lib/utils";

export interface MarketplaceSectionProps {
  /** ID para aria-labelledby y deep-link ancla */
  id?: string;
  /** Kicker opcional encima del titulo (p.ej. "Cocina amazónica") */
  kicker?: string;
  /** Titulo principal de la seccion (h2) */
  title: string;
  /** Subtitulo opcional debajo del titulo */
  subtitle?: string;
  /** Acciones a la derecha del header (p.ej. "Ver todos →") */
  actions?: React.ReactNode;
  /** Contenido real de la seccion */
  children: React.ReactNode;
  /** Clases extra para el <section> raiz */
  className?: string;
  /** Clases extra para el inner container (max-w-7xl) */
  innerClassName?: string;
}

/**
 * Grid canonico para listings de producto.
 * Exportado para que cada seccion lo use directamente si necesita
 * personalizar gap o numero de columnas en algun breakpoint.
 */
export const MARKETPLACE_GRID =
  "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4";

export default function MarketplaceSection({
  id,
  kicker,
  title,
  subtitle,
  actions,
  children,
  className,
  innerClassName,
}: MarketplaceSectionProps) {
  const titleId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("w-full py-8", className)}
    >
      <div
        className={cn(
          "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
          innerClassName,
        )}
      >
        {/* Header */}
        <div className="flex items-end justify-between gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="min-w-0">
            {kicker && (
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">
                {kicker}
              </p>
            )}
            <h2
              id={titleId}
              className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="shrink-0">{actions}</div>
          )}
        </div>

        {/* Content */}
        {children}
      </div>
    </section>
  );
}
