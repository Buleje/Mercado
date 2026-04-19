/**
 * RecipeCardCanonical — card canonical de receta para el recetario (ADR-075 Fase 5).
 *
 * Framework-agnostic: usa `<a>` (no Next Link) e `<img>` nativo por default.
 * Para optimizacion de imagen Next.js, pasar `renderImage` prop con
 * `<Image fill ... />` igual que StoreCardCanonical.
 *
 * Dos variantes:
 *   - `default` — card completa para grids (recetario, explorar).
 *   - `compact` — reducida para widgets y carruseles.
 *
 * Slots abiertos:
 *   - `badges` — arriba del nombre (tiempo, porciones, dificultad, etc).
 *   - `footer` — debajo del nombre (costo total, numero ingredientes, CTA, etc).
 *
 * Reglas visuales (Holded minimalista):
 *   - Sin sombras. Hover: border-strong + transition-colors.
 *   - rounded-lg. 1-2 colores. Sin emojis.
 *   - Imagen: aspect-[4/3] con object-cover. Sin imagen: RecipeImagePlaceholder.
 *
 * @example
 *   <RecipeCardCanonical
 *     recipeId="abc123"
 *     name="Arroz con Pollo"
 *     slug="arroz-con-pollo"
 *     imageUrl={recipe.imageUrl}
 *     badges={<span>30 min</span>}
 *     footer={<span>S/ 12.50</span>}
 *   />
 */
"use client";

import type { ReactNode } from "react";
import { cn } from "./utils";
import { RecipeImagePlaceholder } from "./recipe-image-placeholder";
import { RECIPE_CARD_RATIO } from "./tokens";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RecipeCardCanonicalProps {
  /** ID unico de la receta — alimenta el placeholder deterministico. */
  recipeId: string;
  /** Nombre de la receta. */
  name: string;
  /** Slug para construir el href por default. */
  slug: string;
  /** URL de la imagen principal. Si null/undefined se muestra RecipeImagePlaceholder. */
  imageUrl?: string | null;
  /**
   * Slot de badges (arriba del nombre).
   * Ej: tiempo de preparacion, porciones, dificultad.
   */
  badges?: ReactNode;
  /**
   * Slot de footer (debajo del nombre).
   * Ej: costo total, numero de ingredientes, boton CTA.
   */
  footer?: ReactNode;
  /**
   * Variante visual.
   * - `default` — card completa, padding normal, texto base.
   * - `compact` — padding reducido, texto mas pequeno. Ideal para carouseles y widgets.
   */
  variant?: "default" | "compact";
  /**
   * Override del href. Default: `/recetas/${slug}`.
   */
  href?: string;
  /**
   * Override del render de la imagen — igual que StoreCardCanonical.renderImage.
   * Pasar `<Image fill ... />` de Next.js para optimizacion completa.
   *
   * @example
   *   renderImage={({ src, alt, className }) => (
   *     <Image src={src} alt={alt} fill className={className} sizes="(max-width:640px) 100vw, 400px" />
   *   )}
   */
  renderImage?: (args: { src: string; alt: string; className: string }) => ReactNode;
  /** Override de clases del contenedor raiz. */
  className?: string;
}

// ── Estilos por variante ──────────────────────────────────────────────────────

const CARD_PADDING: Record<NonNullable<RecipeCardCanonicalProps["variant"]>, string> = {
  default: "p-3",
  compact: "p-2",
};

const NAME_SIZE: Record<NonNullable<RecipeCardCanonicalProps["variant"]>, string> = {
  default: "text-[length:var(--ts-base)] font-bold",
  compact: "text-[length:var(--ts-sm)] font-semibold",
};

// ── Componente ────────────────────────────────────────────────────────────────

/**
 * RecipeCardCanonical — unica fuente de verdad para cards de receta en el recetario.
 *
 * - Reemplaza RecipeFallbackIllustration + card inline de RecetarioClient (Fase 5).
 * - NO crea nuevas sombras ni colores — usa solo CSS custom properties del DS.
 */
export function RecipeCardCanonical({
  recipeId,
  name,
  slug,
  imageUrl,
  badges,
  footer,
  variant = "default",
  href,
  renderImage,
  className,
}: RecipeCardCanonicalProps) {
  const resolvedHref = href ?? `/recetas/${slug}`;
  const padding = CARD_PADDING[variant];
  const nameSize = NAME_SIZE[variant];

  const imgClass =
    "absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--dur-base)] group-hover:scale-[1.02]";

  return (
    <a
      href={resolvedHref}
      aria-label={name}
      className={cn(
        "group block overflow-hidden rounded-lg border border-[var(--rule-base)]",
        "bg-[var(--surface-raised)]",
        "transition-colors duration-[var(--dur-fast)]",
        "hover:border-[var(--rule-strong)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
        className,
      )}
    >
      {/* Imagen / placeholder ──────────────────────────────────────────────── */}
      {imageUrl ? (
        <div
          className={cn(
            "relative w-full overflow-hidden",
            `aspect-[${RECIPE_CARD_RATIO}]`,
            "bg-[var(--surface-sunken)]",
          )}
        >
          {renderImage ? (
            renderImage({ src: imageUrl, alt: `Foto de ${name}`, className: imgClass })
          ) : (
            /* DS es framework-agnostic: usa <img> nativo. Next consumers deben pasar renderImage. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`Foto de ${name}`}
              loading="lazy"
              className={imgClass}
            />
          )}
        </div>
      ) : (
        <RecipeImagePlaceholder
          recipeId={recipeId}
          name={name}
          className="rounded-t-lg rounded-b-none"
        />
      )}

      {/* Info ──────────────────────────────────────────────────────────────── */}
      <div className={cn("flex flex-col gap-1", padding)}>
        {/* Slot badges — encima del nombre */}
        {badges != null && (
          <div className="flex flex-wrap gap-1">{badges}</div>
        )}

        {/* Nombre */}
        <p
          className={cn(
            "line-clamp-2 leading-[var(--lh-snug)] text-[var(--text-primary)]",
            nameSize,
          )}
        >
          {name}
        </p>

        {/* Slot footer — debajo del nombre */}
        {footer != null && (
          <div className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            {footer}
          </div>
        )}
      </div>
    </a>
  );
}
