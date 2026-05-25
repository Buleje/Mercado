"use client";

/**
 * MarketplaceSection — wrapper canónico para secciones del marketplace home.
 *
 * Garantiza que TODAS las secciones del home usen el mismo max-width,
 * padding horizontal y vertical, y estructura de header (title + actions).
 *
 * Tokens canonicos:
 *   max-width : max-w-[1600px] (unificado con ofertas del dia, catalogo, para ti)
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

export type MarketplaceSectionTone =
  | "default"
  | "hot" // rojo-naranja: ofertas flash, aprovecha ahora
  | "ranking" // dorado: top más vendidos
  | "fresh"; // verde: selva, productos frescos

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
  /** Tono visual — destaca con color, animacion y urgencia para secciones "explosivas" */
  tone?: MarketplaceSectionTone;
  /** Contenido extra debajo del titulo (p.ej. countdown) */
  headerExtra?: React.ReactNode;
}

/**
 * Grid canonico para listings de producto.
 * 6 columnas a xl (≥1280px) para aprovechar el max-w-[1600px] del wrapper.
 * Escala hacia abajo: 2 mobile → 3 sm → 4 md → 5 lg → 6 xl.
 */
export const MARKETPLACE_GRID =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3";

/**
 * Carrusel horizontal de 1 fila. Scroll con mouse/touch, snap a cada item.
 * Cada hijo debe fijar ancho con `w-[220px]` (o el ancho deseado) + `shrink-0`.
 * Usar via helpers CAROUSEL_ITEM_W para ancho canonico.
 */
export const MARKETPLACE_CAROUSEL =
  "flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-4 pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8";

/** Ancho canonico para cada item de carrusel. Compacto para que encajen 5-6 en viewport xl. */
export const CAROUSEL_ITEM_W = "w-[220px] sm:w-[240px] shrink-0 snap-start";

const TONE_STYLES: Record<
  MarketplaceSectionTone,
  {
    section: string;
    kicker: string;
    title: string;
    titleBg?: string;
    border: string;
    accentPill?: { bg: string; text: string; label: string };
  }
> = {
  default: {
    section: "",
    // Round 11: gray-400 (#9ca3af) sobre blanco = 2.85:1 → FAIL WCAG AA 4.5:1.
    // gray-500 (#6b7280) sobre blanco = 4.83:1 → PASS para texto small.
    kicker: "text-gray-500 dark:text-gray-400",
    title: "text-gray-900 dark:text-white",
    border: "border-gray-200 dark:border-gray-800",
  },
  hot: {
    section:
      "relative overflow-hidden bg-linear-to-br from-red-50 via-orange-50 to-amber-50 dark:from-red-950/40 dark:via-orange-950/30 dark:to-amber-950/20",
    kicker: "text-[var(--data-error-600)] dark:text-red-400",
    title: "text-gray-900 dark:text-white",
    border: "border-red-200 dark:border-red-900/40",
    accentPill: {
      bg: "bg-[var(--data-error-600)]",
      text: "text-white",
      label: "APROVECHA AHORA",
    },
  },
  ranking: {
    section:
      "relative overflow-hidden bg-linear-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-orange-950/20",
    kicker: "text-[var(--data-warning-700)] dark:text-amber-400",
    title: "text-gray-900 dark:text-white",
    border: "border-amber-200 dark:border-amber-900/40",
    accentPill: {
      bg: "bg-[var(--data-warning-500)]",
      text: "text-white",
      label: "TOP VENTAS",
    },
  },
  fresh: {
    section:
      "relative overflow-hidden bg-linear-to-br from-emerald-50 via-teal-50 to-white dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-gray-950",
    kicker: "text-[var(--data-success-700)] dark:text-emerald-400",
    title: "text-gray-900 dark:text-white",
    border: "border-emerald-200 dark:border-emerald-900/40",
  },
};

export default function MarketplaceSection({
  id,
  kicker,
  title,
  subtitle,
  actions,
  children,
  className,
  innerClassName,
  tone = "default",
  headerExtra,
}: MarketplaceSectionProps) {
  const titleId = id ? `${id}-title` : undefined;
  const toneStyles = TONE_STYLES[tone];
  const isExplosive = tone === "hot" || tone === "ranking";

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("w-full py-6 sm:py-12 lg:py-16", toneStyles.section, className)}
    >
      {/* Decorative blobs for explosive variants */}
      {isExplosive && (
        <>
          <div
            aria-hidden
            className={cn(
              "absolute -top-24 -right-24 h-72 w-72 rounded-full blur-[100px] pointer-events-none",
              tone === "hot" ? "bg-red-400/20" : "bg-amber-400/20",
            )}
          />
          <div
            aria-hidden
            className={cn(
              "absolute -bottom-32 -left-24 h-80 w-80 rounded-full blur-[120px] pointer-events-none",
              tone === "hot" ? "bg-orange-400/15" : "bg-yellow-400/15",
            )}
          />
        </>
      )}

      <div
        className={cn(
          "relative max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8",
          innerClassName,
        )}
      >
        {/* Header — typography mayor para mejor jerarquia visual */}
        <div className={cn("flex items-end justify-between gap-3 mb-4 sm:mb-8 pb-3 sm:pb-5 border-b", toneStyles.border)}>
          <div className="min-w-0">
            {(kicker || toneStyles.accentPill) && (
              <div className="flex items-center gap-2 flex-wrap mb-1 sm:mb-2">
                {toneStyles.accentPill && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-widest shadow-sm animate-pulse",
                      toneStyles.accentPill.bg,
                      toneStyles.accentPill.text,
                    )}
                  >
                    {toneStyles.accentPill.label}
                  </span>
                )}
                {kicker && (
                  <p
                    className={cn(
                      "text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)]",
                      toneStyles.kicker,
                    )}
                  >
                    {kicker}
                  </p>
                )}
              </div>
            )}
            <h2
              id={titleId}
              className={cn(
                "font-bold tracking-[var(--ls-tight)]",
                isExplosive
                  ? "text-xl sm:text-3xl lg:text-5xl font-black"
                  : "text-lg sm:text-2xl lg:text-4xl",
                toneStyles.title,
              )}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs sm:text-base text-[var(--text-tertiary)] mt-1 sm:mt-2 max-w-xl leading-relaxed">
                {subtitle}
              </p>
            )}
            {headerExtra && <div className="mt-2 sm:mt-4">{headerExtra}</div>}
          </div>
          {actions && <div className="shrink-0 self-end">{actions}</div>}
        </div>

        {/* Content */}
        {children}
      </div>
    </section>
  );
}
