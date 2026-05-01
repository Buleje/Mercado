/**
 * ProductCardHero — Card grande para productos destacados.
 *
 * Uso recomendado:
 * - "Oferta del dia" hero en marketplace home
 * - Featured en PDP del dia
 * - Top 2-4 de una categoria
 *
 * NO usar en grids de catalogo (usar ProductCardGrid para eso).
 *
 * Layout: 2 columnas desktop (imagen 60% + info 40%), stack vertical mobile.
 * Altura minima: 420px.
 *
 * Props clave:
 *   - `variant` ajusta el kicker + color del badge destacado.
 *   - `priority` desactiva el lazy-loading para above-the-fold.
 *   - `renderImage` permite inyectar `<Image>` de Next.
 */
"use client";

import type { ReactNode } from "react";
import { ShoppingCart, ArrowRight, Star } from "../icons";
import { CardTitle, BodyText, Caption, Kicker } from "../typography";
import { ProductBadge, ProductPrice } from "../store";
import { PrimaryButton } from "../PrimaryButton";
import { cn } from "../utils";
import { ProductImage } from "./ProductImage";
import { resolveDiscount, resolveHref, isOutOfStock } from "./shared";
import type { ProductCardActions, ProductCardProduct } from "./types";

export type ProductCardHeroVariant = "default" | "oferta" | "nuevo";

export interface ProductCardHeroProps extends ProductCardActions {
  product: ProductCardProduct;
  /**
   * Ajusta colores y kicker. `oferta` → warning accent; `nuevo` → accent soft.
   * Default `default`.
   */
  variant?: ProductCardHeroVariant;
  /** Desactiva lazy-loading para above-the-fold. */
  priority?: boolean;
  /**
   * Override del render de la imagen. Pasar `<Image fill ... />` de Next para
   * obtener optimizacion completa. Si no se pasa, usa `<img loading="lazy">`.
   */
  renderImage?: (args: { src: string; alt: string; className: string }) => ReactNode;
  /** Descripcion opcional (2 lines). Cae al category/unit si no viene. */
  description?: ReactNode;
  className?: string;
}

const VARIANT_KICKER: Record<ProductCardHeroVariant, string> = {
  default: "Destacado",
  oferta: "Oferta del dia",
  nuevo: "Novedad",
};

export function ProductCardHero({
  product,
  variant = "default",
  priority,
  renderImage,
  description,
  onAddToCart,
  onQuickView,
  className,
}: ProductCardHeroProps) {
  const discount = resolveDiscount(product);
  const outOfStock = isOutOfStock(product);
  const href = resolveHref(product);
  const alt = product.imageAlt ?? product.name;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl",
        "border border-[var(--rule-base)] bg-[var(--surface-raised)]",
        "min-h-[420px] w-full",
        "transition-all duration-[var(--dur-base)] ease-[var(--ease-soft)]",
        "hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5",
        "md:flex-row",
        className,
      )}
    >
      {/* Imagen — 60% desktop, full width mobile */}
      <div className="relative md:basis-3/5 md:shrink-0">
        <a
          href={href}
          aria-label={product.name}
          className="block h-full w-full"
        >
          <ProductImage
            src={product.image}
            alt={alt}
            aspect="aspect-[4/5]"
            priority={priority}
            hoverZoom
            renderImage={renderImage}
            className="h-full w-full md:aspect-auto md:min-h-[420px]"
          />
        </a>

        {/* Overlay badges arriba-izquierda */}
        <div className="absolute left-4 top-4 flex flex-col gap-2">
          {variant === "oferta" && discount != null && (
            <ProductBadge intent="offer">-{discount}%</ProductBadge>
          )}
          {variant === "nuevo" && (
            <ProductBadge intent="new">Nuevo</ProductBadge>
          )}
          {product.badge === "socio" && (
            <ProductBadge intent="premium">Socio</ProductBadge>
          )}
          {product.badge === "top" && (
            <ProductBadge intent="popular">Top</ProductBadge>
          )}
          {outOfStock && (
            <ProductBadge intent="new">Agotado</ProductBadge>
          )}
        </div>

        {onQuickView && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuickView(product);
            }}
            aria-label={`Vista rapida de ${product.name}`}
            className={cn(
              "absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center",
              "rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)]",
              "border border-[var(--rule-base)] shadow-[var(--shadow-sm)]",
              "opacity-0 transition-opacity duration-[var(--dur-fast)]",
              "group-hover:opacity-100 hover:text-[var(--text-primary)]",
            )}
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Info — 40% desktop */}
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6 md:basis-2/5 md:justify-center">
        <Kicker
          className={cn(
            variant === "oferta" && "text-[var(--data-warning-700)]",
            variant === "nuevo" && "text-[var(--accent)]",
          )}
        >
          {product.category ?? VARIANT_KICKER[variant]}
        </Kicker>

        <a href={href} className="block">
          <CardTitle className="text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] leading-[var(--lh-tight)]">
            {product.name}
          </CardTitle>
        </a>

        {description !== undefined ? (
          <BodyText className="line-clamp-2 text-[var(--text-secondary)]">
            {description}
          </BodyText>
        ) : product.unit ? (
          <BodyText className="line-clamp-2 text-[var(--text-secondary)]">
            {product.unit}
          </BodyText>
        ) : null}

        {/* Rating */}
        {typeof product.rating === "number" && product.rating > 0 && (
          <div className="flex items-center gap-1.5">
            <Star
              className="h-4 w-4 fill-[var(--data-warning)] text-[var(--data-warning)]"
              aria-hidden
            />
            <Caption className="font-semibold text-[var(--text-primary)]">
              {product.rating.toFixed(1)}
            </Caption>
            {product.reviewCount ? (
              <Caption className="text-[var(--text-tertiary)]">
                ({product.reviewCount})
              </Caption>
            ) : null}
          </div>
        )}

        {/* Precio grande */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <ProductPrice
            price={product.price}
            previousPrice={product.originalPrice}
            size="lg"
            unit={product.unit ?? undefined}
          />
          {discount != null && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5",
                "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide",
                variant === "oferta"
                  ? "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]"
                  : "bg-[var(--accent-soft)] text-[var(--accent)]",
              )}
            >
              -{discount}%
            </span>
          )}
        </div>

        {/* Store */}
        {product.storeName && (
          <Caption className="text-[var(--text-tertiary)]">
            {product.storeName}
          </Caption>
        )}

        {/* CTAs */}
        <div className="mt-2 flex flex-wrap gap-2">
          <PrimaryButton
            size="lg"
            variant="primary"
            disabled={outOfStock}
            leftIcon={<ShoppingCart className="h-4 w-4" aria-hidden />}
            onClick={() => onAddToCart?.(product)}
          >
            {outOfStock ? "Agotado" : "Agregar al carrito"}
          </PrimaryButton>
          <PrimaryButton size="lg" variant="ghost" asChild>
            <a href={href}>
              Ver detalles
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </a>
          </PrimaryButton>
        </div>
      </div>
    </article>
  );
}
